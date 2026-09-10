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
 * Totais da comanda e desconto manual (M12, ACTIVE_PLAN.md) — **CRÍTICO** (dinheiro,
 * regra 2 do CLAUDE.md): 3 frentes. Roda contra Postgres real na CI, API conectada
 * como `bella_app`. `bella` (seed) tem `service_fee_mode='optional'`,
 * `service_fee_bps=1000` (10%) e `couvert_mode='off'` por padrão — o lock-in
 * automático do M12 deve gerar `service_fee` e NUNCA `couvert` neste tenant.
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

const ownerEmail = `m12-owner-${newId()}@example.com`;
const kitchenEmail = `m12-kitchen-${newId()}@example.com`;
const password = 'senha-forte-m12-000';

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
  productPriceCents: number;
}

/** Cria produto + mesa + comanda com um pedido de staff já cobrado (M8). */
async function createTabWithOrder(priceCents = 8_000): Promise<Setup> {
  const ownerCookie = await login(ownerEmail);
  const suffix = newId().slice(-8);
  const headers = { cookie: ownerCookie, 'x-tenant-id': bellaTenantId };

  const stationRes = await app.inject({
    method: 'POST',
    url: '/v1/catalog/stations',
    headers,
    payload: { name: `Estação M12 ${suffix}` },
  });
  const stationId = (stationRes.json() as { station: { id: string } }).station.id;
  const categoryRes = await app.inject({
    method: 'POST',
    url: '/v1/catalog/categories',
    headers,
    payload: { name: `Categoria M12 ${suffix}` },
  });
  const categoryId = (categoryRes.json() as { category: { id: string } }).category.id;
  const productRes = await app.inject({
    method: 'POST',
    url: '/v1/catalog/products',
    headers,
    payload: { categoryId, stationId, name: `Produto M12 ${suffix}`, basePriceCents: priceCents },
  });
  const productId = (productRes.json() as { product: { id: string } }).product.id;

  const tableRes = await app.inject({
    method: 'POST',
    url: '/v1/tables',
    headers,
    payload: { label: `Mesa M12 ${suffix}` },
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
  return { tabId: orderRow[0]!.tabId, productPriceCents: priceCents };
}

/** Consulta independente do ledger (nunca passa pela API) para conferir o total. */
async function ledgerSumByType(tabId: string, types: string[]): Promise<number> {
  const rows = await withTenant(ownerDb.db, bellaTenantId, (tx) =>
    tx.select().from(schema.ledgerEntries).where(eq(schema.ledgerEntries.tabId, tabId)),
  );
  return rows.filter((r) => types.includes(r.type)).reduce((sum, r) => sum + r.amountCents, 0);
}

async function countLedgerEntriesByType(tabId: string, type: string): Promise<number> {
  const rows = await withTenant(ownerDb.db, bellaTenantId, (tx) =>
    tx.select().from(schema.ledgerEntries).where(eq(schema.ledgerEntries.tabId, tabId)),
  );
  return rows.filter((r) => r.type === type).length;
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
    [ownerEmail, 'Dono M12', ownerRoleId],
    [kitchenEmail, 'Cozinha M12', kitchenRoleId],
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

describe('GET /v1/tabs/:id/bill — lock-in automático e idempotência', () => {
  it('primeira consulta trava a taxa de serviço (10%); total bate com o ledger', async () => {
    const setup = await createTabWithOrder(8_000);
    const ownerCookie = await login(ownerEmail);

    const res = await app.inject({
      method: 'GET',
      url: `/v1/tabs/${setup.tabId}/bill`,
      headers: { cookie: ownerCookie, 'x-tenant-id': bellaTenantId },
    });
    expect(res.statusCode, res.body).toBe(200);
    const bill = (res.json() as { bill: Record<string, number> }).bill;

    expect(bill.itemsTotalCents).toBe(8_000);
    expect(bill.serviceFeeCents).toBe(800); // 10% de 8000
    expect(bill.couvertCents).toBe(0); // couvert_mode = off no seed
    expect(bill.grandTotalCents).toBe(8_800);
    expect(bill.balanceCents).toBe(8_800);

    // Consulta independente ao ledger (nunca via API): confirma que o valor
    // devolvido pela API é exatamente o que está gravado, não um cálculo à parte.
    const ledgerServiceFee = await ledgerSumByType(setup.tabId, ['service_fee']);
    expect(ledgerServiceFee).toBe(800);
    expect(await countLedgerEntriesByType(setup.tabId, 'service_fee')).toBe(1);
  });

  it('segunda consulta NÃO duplica o lançamento (idempotente por construção)', async () => {
    const setup = await createTabWithOrder(5_000);
    const ownerCookie = await login(ownerEmail);
    const headers = { cookie: ownerCookie, 'x-tenant-id': bellaTenantId };

    const first = await app.inject({ method: 'GET', url: `/v1/tabs/${setup.tabId}/bill`, headers });
    const second = await app.inject({
      method: 'GET',
      url: `/v1/tabs/${setup.tabId}/bill`,
      headers,
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    const firstBill = (first.json() as { bill: Record<string, number> }).bill;
    const secondBill = (second.json() as { bill: Record<string, number> }).bill;
    expect(secondBill.serviceFeeCents).toBe(firstBill.serviceFeeCents);
    expect(secondBill.grandTotalCents).toBe(firstBill.grandTotalCents);

    // Duas chamadas concorrentes reais, mesmo padrão de verificação.
    const [parallelA, parallelB] = await Promise.all([
      app.inject({ method: 'GET', url: `/v1/tabs/${setup.tabId}/bill`, headers }),
      app.inject({ method: 'GET', url: `/v1/tabs/${setup.tabId}/bill`, headers }),
    ]);
    expect(parallelA.statusCode).toBe(200);
    expect(parallelB.statusCode).toBe(200);

    expect(await countLedgerEntriesByType(setup.tabId, 'service_fee')).toBe(1);
  });
});

describe('POST /v1/tabs/:id/discounts', () => {
  it('desconto percentual materializa em ledger_entries e reduz o total', async () => {
    const setup = await createTabWithOrder(10_000);
    const ownerCookie = await login(ownerEmail);
    const headers = { cookie: ownerCookie, 'x-tenant-id': bellaTenantId };

    const discountRes = await app.inject({
      method: 'POST',
      url: `/v1/tabs/${setup.tabId}/discounts`,
      headers,
      payload: { kind: 'percentage', bps: 1_000, reason: 'Cliente fidelidade' }, // 10%
    });
    expect(discountRes.statusCode, discountRes.body).toBe(201);
    const discount = (discountRes.json() as { discount: { amountCents: number } }).discount;
    expect(discount.amountCents).toBe(1_000); // 10% de 10000

    const ledgerDiscount = await ledgerSumByType(setup.tabId, ['discount']);
    expect(ledgerDiscount).toBe(-1_000); // sinal negativo no ledger

    const billRes = await app.inject({
      method: 'GET',
      url: `/v1/tabs/${setup.tabId}/bill`,
      headers,
    });
    const bill = (billRes.json() as { bill: Record<string, number> }).bill;
    expect(bill.discountsCents).toBe(1_000);
    // service_fee calculado sobre o líquido pós-desconto: (10000-1000)*10% = 900
    expect(bill.serviceFeeCents).toBe(900);
    expect(bill.grandTotalCents).toBe(10_000 - 1_000 + 900);
  });

  it('desconto maior que o saldo de itens é rejeitado (nunca limitado a zero em silêncio)', async () => {
    const setup = await createTabWithOrder(1_000);
    const ownerCookie = await login(ownerEmail);
    const headers = { cookie: ownerCookie, 'x-tenant-id': bellaTenantId };

    const res = await app.inject({
      method: 'POST',
      url: `/v1/tabs/${setup.tabId}/discounts`,
      headers,
      payload: { kind: 'fixed', amountCents: 5_000, reason: 'Tentativa inválida' },
    });
    expect(res.statusCode, res.body).toBe(400);
    expect(await ledgerSumByType(setup.tabId, ['discount'])).toBe(0);
  });

  it('sem discounts.apply → 403 (negativo); dono TEM a permissão (positivo)', async () => {
    const setup = await createTabWithOrder(2_000);
    const kitchenCookie = await login(kitchenEmail);

    const denied = await app.inject({
      method: 'POST',
      url: `/v1/tabs/${setup.tabId}/discounts`,
      headers: { cookie: kitchenCookie, 'x-tenant-id': bellaTenantId },
      payload: { kind: 'fixed', amountCents: 100, reason: 'Teste' },
    });
    expect(denied.statusCode).toBe(403);

    const ownerCookie = await login(ownerEmail);
    const allowed = await app.inject({
      method: 'POST',
      url: `/v1/tabs/${setup.tabId}/discounts`,
      headers: { cookie: ownerCookie, 'x-tenant-id': bellaTenantId },
      payload: { kind: 'fixed', amountCents: 100, reason: 'Teste' },
    });
    expect(allowed.statusCode, allowed.body).toBe(201);
  });
});

describe('isolamento entre tenants', () => {
  it('comanda de outro tenant nunca é encontrada (404, não vaza)', async () => {
    const setup = await createTabWithOrder(3_000);
    const demoOwnerEmail = `m12-demo-${newId()}@example.com`;
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
      payload: { name: 'Dono Demo M12', email: demoOwnerEmail, password },
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

    const billRes = await app.inject({
      method: 'GET',
      url: `/v1/tabs/${setup.tabId}/bill`,
      headers: { cookie: demoCookie, 'x-tenant-id': demoTenantId },
    });
    expect(billRes.statusCode).toBe(404);

    const discountRes = await app.inject({
      method: 'POST',
      url: `/v1/tabs/${setup.tabId}/discounts`,
      headers: { cookie: demoCookie, 'x-tenant-id': demoTenantId },
      payload: { kind: 'fixed', amountCents: 100, reason: 'Teste cross-tenant' },
    });
    expect(discountRes.statusCode).toBe(404);
  });
});
