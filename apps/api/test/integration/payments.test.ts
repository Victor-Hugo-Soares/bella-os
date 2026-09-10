import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { createDb, schema, withoutTenant, withTenant, type DbHandle } from '@bella/db';
import { runMigrations } from '@bella/db/migrate';
import { seed, SEED_TENANTS } from '@bella/db/seed';
import { setAppRolePassword } from '@bella/db/set-app-role-password';
import { newId } from '@bella/domain';
import { buildApp } from '../../src/app';
import { loadConfig } from '../../src/config';
import { GUEST_SESSION_COOKIE } from '../../src/modules/tables/routes';

/**
 * Sessão de caixa e pagamentos (M13, ACTIVE_PLAN.md) — **CRÍTICO** (dinheiro/caixa,
 * regra 2 do CLAUDE.md): 3 frentes. Roda contra Postgres real na CI, API conectada
 * como `bella_app`. `bella` (seed) tem um `cash_register` único ("Caixa único",
 * provisionado no próprio seed) e `service_fee_mode='optional'` (10%) — cada comanda
 * criada aqui com preço de item redondo (10000 centavos) para deixar o saldo previsível
 * (grand_total = 11000, taxa de serviço travada no primeiro pagamento/consulta).
 */
const ownerUrl = process.env.TEST_DATABASE_URL;
const appPassword = process.env.APP_DB_PASSWORD;
const appUrl = process.env.TEST_APP_DATABASE_URL;
if (!ownerUrl || !appPassword || !appUrl) {
  throw new Error(
    'TEST_DATABASE_URL, APP_DB_PASSWORD e TEST_APP_DATABASE_URL precisam estar definidas.',
  );
}

const BETTER_AUTH_SECRET = 'x'.repeat(32);

let ownerDb: DbHandle;
let appDb: DbHandle;
let app: FastifyInstance;
let bellaTenantId: string;
let bellaTenantSlug: string;

const ownerEmail = `m13-owner-${newId()}@example.com`;
const kitchenEmail = `m13-kitchen-${newId()}@example.com`;
const password = 'senha-forte-m13-000';

async function login(email: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    payload: { email, password },
  });
  const setCookie = res.headers['set-cookie'];
  const raw = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const cookie = raw
    .map((c) => c.split(';')[0])
    .filter((c): c is string => Boolean(c))
    .join('; ');
  if (!cookie) throw new Error(`login falhou: ${res.body}`);
  return cookie;
}

interface Setup {
  tabId: string;
}

/** Cria produto (10000 centavos) + mesa + comanda com um pedido de cliente já cobrado. */
async function createTabWithOrder(): Promise<Setup> {
  const ownerCookie = await login(ownerEmail);
  const suffix = newId().slice(-8);
  const headers = { cookie: ownerCookie, 'x-tenant-id': bellaTenantId };

  const stationRes = await app.inject({
    method: 'POST',
    url: '/v1/catalog/stations',
    headers,
    payload: { name: `Estação M13 ${suffix}` },
  });
  const stationId = (stationRes.json() as { station: { id: string } }).station.id;
  const categoryRes = await app.inject({
    method: 'POST',
    url: '/v1/catalog/categories',
    headers,
    payload: { name: `Categoria M13 ${suffix}` },
  });
  const categoryId = (categoryRes.json() as { category: { id: string } }).category.id;
  const productRes = await app.inject({
    method: 'POST',
    url: '/v1/catalog/products',
    headers,
    payload: { categoryId, stationId, name: `Produto M13 ${suffix}`, basePriceCents: 10_000 },
  });
  const productId = (productRes.json() as { product: { id: string } }).product.id;

  const tableRes = await app.inject({
    method: 'POST',
    url: '/v1/tables',
    headers,
    payload: { label: `Mesa M13 ${suffix}` },
  });
  const table = (tableRes.json() as { table: { qrCode: string } }).table;
  const openRes = await app.inject({
    method: 'POST',
    url: `/public/${bellaTenantSlug}/tables/${table.qrCode}/session`,
  });
  const setCookie = openRes.headers['set-cookie'];
  const raw = Array.isArray(setCookie) ? setCookie : setCookie ? [String(setCookie)] : [];
  const guestCookieHeader = raw
    .map((c) => String(c))
    .find((c) => c.startsWith(`${GUEST_SESSION_COOKIE}=`));
  if (!guestCookieHeader) throw new Error('cookie de sessão de mesa ausente');
  const guestCookie = guestCookieHeader.split(';')[0]!;

  const orderRes = await app.inject({
    method: 'POST',
    url: `/public/${bellaTenantSlug}/orders`,
    headers: { cookie: guestCookie, 'idempotency-key': newId() },
    payload: { items: [{ productId, quantity: 1 }] },
  });
  const orderBody = orderRes.json() as { order: { id: string } };

  const orderRow = await withTenant(ownerDb.db, bellaTenantId, (tx) =>
    tx.select().from(schema.orders).where(eq(schema.orders.id, orderBody.order.id)),
  );
  return { tabId: orderRow[0]!.tabId };
}

/** Consulta independente do ledger (nunca via API) para conferir o saldo. */
async function tabBalance(tabId: string): Promise<number> {
  const rows = await withTenant(ownerDb.db, bellaTenantId, (tx) =>
    tx.select().from(schema.ledgerEntries).where(eq(schema.ledgerEntries.tabId, tabId)),
  );
  return rows.reduce((sum, r) => sum + r.amountCents, 0);
}

beforeAll(async () => {
  await runMigrations(ownerUrl);
  await setAppRolePassword(ownerUrl, appPassword);
  ownerDb = createDb(ownerUrl, { max: 4 });
  appDb = createDb(appUrl, { max: 4 });
  await seed(ownerDb.db);

  const bellaSpec = SEED_TENANTS.find((t) => t.slug === 'bella')!;
  bellaTenantSlug = bellaSpec.slug;
  const tenantRows = await withoutTenant(ownerDb.db, (tx) =>
    tx.select({ id: schema.tenants.id, slug: schema.tenants.slug }).from(schema.tenants),
  );
  bellaTenantId = tenantRows.find((r) => r.slug === bellaSpec.slug)!.id;

  app = await buildApp({
    config: loadConfig({
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: ownerUrl,
      APP_DATABASE_URL: appUrl,
      BETTER_AUTH_SECRET,
    }),
    db: appDb,
    version: 'test',
  });
  await app.ready();

  const bellaRoles = await withTenant(ownerDb.db, bellaTenantId, (tx) =>
    tx.select().from(schema.roles).where(eq(schema.roles.tenantId, bellaTenantId)),
  );
  const ownerRoleId = bellaRoles.find((r) => r.name === 'owner')!.id;
  const kitchenRoleId = bellaRoles.find((r) => r.name === 'kitchen')!.id;

  for (const [email, name, roleId] of [
    [ownerEmail, 'Dono M13', ownerRoleId],
    [kitchenEmail, 'Cozinha M13', kitchenRoleId],
  ] as const) {
    const signUp = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: { name, email, password },
    });
    const userId = (signUp.json() as { user: { id: string } }).user.id;
    await withTenant(ownerDb.db, bellaTenantId, (tx) =>
      tx
        .insert(schema.memberships)
        .values({ id: newId(), userId, tenantId: bellaTenantId, roleId }),
    );
  }
});

afterAll(async () => {
  await app.close();
  await appDb.close();
  await ownerDb.close();
});

describe('POST /v1/tabs/:id/payments sem sessão de caixa aberta', () => {
  it('rejeita com CASH_SESSION_CLOSED (nenhuma sessão foi aberta ainda neste tenant)', async () => {
    const setup = await createTabWithOrder();
    const ownerCookie = await login(ownerEmail);
    const res = await app.inject({
      method: 'POST',
      url: `/v1/tabs/${setup.tabId}/payments`,
      headers: { cookie: ownerCookie, 'x-tenant-id': bellaTenantId, 'idempotency-key': newId() },
      payload: { method: 'cash', amountCents: 1_000, tenderedCents: 1_000 },
    });
    expect(res.statusCode, res.body).toBe(409);
    expect((res.json() as { error: { code: string } }).error.code).toBe('CASH_SESSION_CLOSED');
  });
});

describe('POST /v1/cash-sessions/open', () => {
  it('sem cash.open → 403; dono abre a sessão (positivo)', async () => {
    const kitchenCookie = await login(kitchenEmail);
    const denied = await app.inject({
      method: 'POST',
      url: '/v1/cash-sessions/open',
      headers: { cookie: kitchenCookie, 'x-tenant-id': bellaTenantId },
      payload: { openingFloatCents: 10_000 },
    });
    expect(denied.statusCode).toBe(403);

    const ownerCookie = await login(ownerEmail);
    const opened = await app.inject({
      method: 'POST',
      url: '/v1/cash-sessions/open',
      headers: { cookie: ownerCookie, 'x-tenant-id': bellaTenantId },
      payload: { openingFloatCents: 10_000 },
    });
    expect(opened.statusCode, opened.body).toBe(201);
    expect((opened.json() as { session: { status: string } }).session.status).toBe('open');

    const current = await app.inject({
      method: 'GET',
      url: '/v1/cash-sessions/current',
      headers: { cookie: ownerCookie, 'x-tenant-id': bellaTenantId },
    });
    expect((current.json() as { session: { status: string } | null }).session?.status).toBe('open');
  });

  it('abrir uma segunda sessão com a primeira ainda aberta → 409 (só uma por registrador)', async () => {
    const ownerCookie = await login(ownerEmail);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/cash-sessions/open',
      headers: { cookie: ownerCookie, 'x-tenant-id': bellaTenantId },
      payload: { openingFloatCents: 5_000 },
    });
    expect(res.statusCode).toBe(409);
  });
});

describe('POST /v1/tabs/:id/payments — registrar e estornar', () => {
  it('pagamento parcial em dinheiro reduz o saldo e calcula troco', async () => {
    const setup = await createTabWithOrder();
    const ownerCookie = await login(ownerEmail);
    const headers = { cookie: ownerCookie, 'x-tenant-id': bellaTenantId };

    const res = await app.inject({
      method: 'POST',
      url: `/v1/tabs/${setup.tabId}/payments`,
      headers: { ...headers, 'idempotency-key': newId() },
      payload: { method: 'cash', amountCents: 5_000, tenderedCents: 10_000 },
    });
    expect(res.statusCode, res.body).toBe(201);
    const payment = (res.json() as { payment: { changeCents: number; amountCents: number } })
      .payment;
    expect(payment.amountCents).toBe(5_000);
    expect(payment.changeCents).toBe(5_000); // 10000 entregue - 5000 aplicado à comanda

    // grand_total = 10000 (item) + 1000 (10% service_fee, travado agora) = 11000
    // saldo do ledger = 11000 - 5000 (pagamento) = 6000, consulta independente.
    const balance = await tabBalance(setup.tabId);
    expect(balance).toBe(6_000);
  });

  it('estornar pagamento devolve o saldo (idempotente — estornar duas vezes não duplica)', async () => {
    const setup = await createTabWithOrder();
    const ownerCookie = await login(ownerEmail);
    const headers = { cookie: ownerCookie, 'x-tenant-id': bellaTenantId };

    const payRes = await app.inject({
      method: 'POST',
      url: `/v1/tabs/${setup.tabId}/payments`,
      headers: { ...headers, 'idempotency-key': newId() },
      payload: { method: 'pix', amountCents: 11_000 },
    });
    const paymentId = (payRes.json() as { payment: { id: string } }).payment.id;
    expect(await tabBalance(setup.tabId)).toBe(0);

    const void1 = await app.inject({
      method: 'POST',
      url: `/v1/payments/${paymentId}/void`,
      headers,
      payload: { reason: 'PIX caiu em duplicidade' },
    });
    expect(void1.statusCode, void1.body).toBe(200);
    expect(await tabBalance(setup.tabId)).toBe(11_000);

    const void2 = await app.inject({
      method: 'POST',
      url: `/v1/payments/${paymentId}/void`,
      headers,
      payload: { reason: 'tentativa duplicada' },
    });
    expect(void2.statusCode, void2.body).toBe(200);
    expect(await tabBalance(setup.tabId)).toBe(11_000); // não -11000 nem 22000
  });

  it('duas requisições com a MESMA Idempotency-Key criam só um pagamento', async () => {
    const setup = await createTabWithOrder();
    const ownerCookie = await login(ownerEmail);
    const headers = {
      cookie: ownerCookie,
      'x-tenant-id': bellaTenantId,
      'idempotency-key': newId(),
    };
    const payload = { method: 'debit' as const, amountCents: 11_000 };

    const [first, second] = await Promise.all([
      app.inject({ method: 'POST', url: `/v1/tabs/${setup.tabId}/payments`, headers, payload }),
      app.inject({ method: 'POST', url: `/v1/tabs/${setup.tabId}/payments`, headers, payload }),
    ]);
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect((first.json() as { payment: { id: string } }).payment.id).toBe(
      (second.json() as { payment: { id: string } }).payment.id,
    );
    expect(await tabBalance(setup.tabId)).toBe(0); // não -11000 (pago em dobro)
  });
});

describe('overpayment e concorrência', () => {
  it('pagamento maior que o saldo → 409 OVERPAYMENT, nada gravado', async () => {
    const setup = await createTabWithOrder();
    const ownerCookie = await login(ownerEmail);
    const res = await app.inject({
      method: 'POST',
      url: `/v1/tabs/${setup.tabId}/payments`,
      headers: { cookie: ownerCookie, 'x-tenant-id': bellaTenantId, 'idempotency-key': newId() },
      payload: { method: 'credit', amountCents: 50_000 },
    });
    expect(res.statusCode, res.body).toBe(409);
    expect((res.json() as { error: { code: string } }).error.code).toBe('OVERPAYMENT');
    expect(await tabBalance(setup.tabId)).toBe(11_000); // saldo intacto
  });

  it('dois pagamentos concorrentes que juntos excedem o saldo — só um vence', async () => {
    const setup = await createTabWithOrder();
    const ownerCookie = await login(ownerEmail);
    const headers = { cookie: ownerCookie, 'x-tenant-id': bellaTenantId };
    // saldo = 11000; cada pagamento sozinho cabe (6000 < 11000), mas juntos (12000) excedem.
    const [a, b] = await Promise.all([
      app.inject({
        method: 'POST',
        url: `/v1/tabs/${setup.tabId}/payments`,
        headers: { ...headers, 'idempotency-key': newId() },
        payload: { method: 'debit', amountCents: 6_000 },
      }),
      app.inject({
        method: 'POST',
        url: `/v1/tabs/${setup.tabId}/payments`,
        headers: { ...headers, 'idempotency-key': newId() },
        payload: { method: 'debit', amountCents: 6_000 },
      }),
    ]);
    const statuses = [a.statusCode, b.statusCode].sort();
    expect(statuses).toEqual([201, 409]);
    expect(await tabBalance(setup.tabId)).toBe(5_000); // 11000 - 6000, nunca -1000
  });
});

describe('negativo/isolamento', () => {
  it('sem payments.record → 403', async () => {
    const setup = await createTabWithOrder();
    const kitchenCookie = await login(kitchenEmail);
    const res = await app.inject({
      method: 'POST',
      url: `/v1/tabs/${setup.tabId}/payments`,
      headers: { cookie: kitchenCookie, 'x-tenant-id': bellaTenantId, 'idempotency-key': newId() },
      payload: { method: 'cash', amountCents: 1_000, tenderedCents: 1_000 },
    });
    expect(res.statusCode).toBe(403);
  });

  it('sem payments.void → 403', async () => {
    const setup = await createTabWithOrder();
    const ownerCookie = await login(ownerEmail);
    const payRes = await app.inject({
      method: 'POST',
      url: `/v1/tabs/${setup.tabId}/payments`,
      headers: { cookie: ownerCookie, 'x-tenant-id': bellaTenantId, 'idempotency-key': newId() },
      payload: { method: 'credit', amountCents: 1_000 },
    });
    const paymentId = (payRes.json() as { payment: { id: string } }).payment.id;

    const kitchenCookie = await login(kitchenEmail);
    const voidRes = await app.inject({
      method: 'POST',
      url: `/v1/payments/${paymentId}/void`,
      headers: { cookie: kitchenCookie, 'x-tenant-id': bellaTenantId },
      payload: { reason: 'Teste' },
    });
    expect(voidRes.statusCode).toBe(403);
  });

  it('comanda de outro tenant nunca é encontrada em /payments (404, não vaza)', async () => {
    const setup = await createTabWithOrder();
    const demoOwnerEmail = `m13-demo-${newId()}@example.com`;
    const tenantRows = await withoutTenant(ownerDb.db, (tx) =>
      tx.select({ id: schema.tenants.id, slug: schema.tenants.slug }).from(schema.tenants),
    );
    const demoTenantId = tenantRows.find((r) => r.slug === 'demo')!.id;
    const demoRoles = await withTenant(ownerDb.db, demoTenantId, (tx) =>
      tx.select().from(schema.roles).where(eq(schema.roles.tenantId, demoTenantId)),
    );
    const demoOwnerRoleId = demoRoles.find((r) => r.name === 'owner')!.id;
    const demoSignUp = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: { name: 'Dono Demo M13', email: demoOwnerEmail, password },
    });
    const demoUserId = (demoSignUp.json() as { user: { id: string } }).user.id;
    await withTenant(ownerDb.db, demoTenantId, (tx) =>
      tx.insert(schema.memberships).values({
        id: newId(),
        userId: demoUserId,
        tenantId: demoTenantId,
        roleId: demoOwnerRoleId,
      }),
    );
    const demoCookie = await login(demoOwnerEmail);

    // demo precisa da própria sessão de caixa aberta para não confundir os códigos de erro.
    await app.inject({
      method: 'POST',
      url: '/v1/cash-sessions/open',
      headers: { cookie: demoCookie, 'x-tenant-id': demoTenantId },
      payload: { openingFloatCents: 0 },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/v1/tabs/${setup.tabId}/payments`,
      headers: { cookie: demoCookie, 'x-tenant-id': demoTenantId, 'idempotency-key': newId() },
      payload: { method: 'cash', amountCents: 1_000, tenderedCents: 1_000 },
    });
    expect(res.statusCode).toBe(404);
  });
});
