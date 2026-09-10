import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { createDb, schema, withoutTenant, withTenant, type DbHandle } from '@bella/db';
import { runMigrations } from '@bella/db/migrate';
import { seed, SEED_TENANTS } from '@bella/db/seed';
import { setAppRolePassword } from '@bella/db/set-app-role-password';
import { newId } from '@bella/domain';
import { buildApp } from '../../src/app';
import { loadConfig } from '../../src/config';
import { GUEST_SESSION_COOKIE } from '../../src/modules/tables/routes';

/**
 * Fechamento de caixa (M14, ACTIVE_PLAN.md) — **CRÍTICO** (dinheiro/caixa, regra 2 do
 * CLAUDE.md): 3 frentes. Roda contra Postgres real na CI, API conectada como
 * `bella_app`. Usa o tenant **demo** (não `bella`) de propósito: `payments.test.ts` (M13)
 * abre uma sessão de caixa no registrador único do `bella` e nunca fecha (não existia
 * `close` no M13) — usar `demo`, que tem seu próprio registrador seedado, evita
 * qualquer disputa pelo índice único "uma sessão aberta por registrador" entre arquivos
 * de teste rodando contra o mesmo Postgres.
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
let demoTenantId: string;
let demoTenantSlug: string;

const ownerEmail = `m14-owner-${newId()}@example.com`;
const kitchenEmail = `m14-kitchen-${newId()}@example.com`;
const password = 'senha-forte-m14-000';

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

/** Cria produto (preço redondo) + mesa + comanda com um pedido de cliente já cobrado. */
async function createTabWithOrder(priceCents: number): Promise<{ tabId: string }> {
  const ownerCookie = await login(ownerEmail);
  const suffix = newId().slice(-8);
  const headers = { cookie: ownerCookie, 'x-tenant-id': demoTenantId };

  const stationRes = await app.inject({
    method: 'POST',
    url: '/v1/catalog/stations',
    headers,
    payload: { name: `Estação M14 ${suffix}` },
  });
  const stationId = (stationRes.json() as { station: { id: string } }).station.id;
  const categoryRes = await app.inject({
    method: 'POST',
    url: '/v1/catalog/categories',
    headers,
    payload: { name: `Categoria M14 ${suffix}` },
  });
  const categoryId = (categoryRes.json() as { category: { id: string } }).category.id;
  const productRes = await app.inject({
    method: 'POST',
    url: '/v1/catalog/products',
    headers,
    payload: { categoryId, stationId, name: `Produto M14 ${suffix}`, basePriceCents: priceCents },
  });
  const productId = (productRes.json() as { product: { id: string } }).product.id;

  const tableRes = await app.inject({
    method: 'POST',
    url: '/v1/tables',
    headers,
    payload: { label: `Mesa M14 ${suffix}` },
  });
  const table = (tableRes.json() as { table: { qrCode: string } }).table;
  const openRes = await app.inject({
    method: 'POST',
    url: `/public/${demoTenantSlug}/tables/${table.qrCode}/session`,
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
    url: `/public/${demoTenantSlug}/orders`,
    headers: { cookie: guestCookie, 'idempotency-key': newId() },
    payload: { items: [{ productId, quantity: 1 }] },
  });
  const orderBody = orderRes.json() as { order: { id: string } };
  const orderRow = await withTenant(ownerDb.db, demoTenantId, (tx) =>
    tx.select().from(schema.orders).where(eq(schema.orders.id, orderBody.order.id)),
  );
  return { tabId: orderRow[0]!.tabId };
}

async function countDivergences(cashSessionId: string): Promise<number> {
  const rows = await withTenant(ownerDb.db, demoTenantId, (tx) =>
    tx
      .select()
      .from(schema.cashDivergences)
      .where(eq(schema.cashDivergences.cashSessionId, cashSessionId)),
  );
  return rows.length;
}

beforeAll(async () => {
  await runMigrations(ownerUrl);
  await setAppRolePassword(ownerUrl, appPassword);
  ownerDb = createDb(ownerUrl, { max: 4 });
  appDb = createDb(appUrl, { max: 4 });
  await seed(ownerDb.db);

  const demoSpec = SEED_TENANTS.find((t) => t.slug === 'demo')!;
  demoTenantSlug = demoSpec.slug;
  const tenantRows = await withoutTenant(ownerDb.db, (tx) =>
    tx.select({ id: schema.tenants.id, slug: schema.tenants.slug }).from(schema.tenants),
  );
  demoTenantId = tenantRows.find((r) => r.slug === demoSpec.slug)!.id;

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

  const demoRoles = await withTenant(ownerDb.db, demoTenantId, (tx) =>
    tx.select().from(schema.roles).where(eq(schema.roles.tenantId, demoTenantId)),
  );
  const ownerRoleId = demoRoles.find((r) => r.name === 'owner')!.id;
  const kitchenRoleId = demoRoles.find((r) => r.name === 'kitchen')!.id;

  for (const [email, name, roleId] of [
    [ownerEmail, 'Dono M14', ownerRoleId],
    [kitchenEmail, 'Cozinha M14', kitchenRoleId],
  ] as const) {
    const signUp = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: { name, email, password },
    });
    const userId = (signUp.json() as { user: { id: string } }).user.id;
    await withTenant(ownerDb.db, demoTenantId, (tx) =>
      tx.insert(schema.memberships).values({ id: newId(), userId, tenantId: demoTenantId, roleId }),
    );
  }

  // Defesa contra ordem de execução entre arquivos de teste: `payments.test.ts` (M13)
  // abre — e nunca fecha, propositalmente, para testar isolamento cross-tenant — uma
  // sessão de caixa no registrador único do `demo`. Fecha aqui direto no banco (não é
  // o que este arquivo testa) para garantir um registrador livre antes de qualquer teste.
  await withTenant(ownerDb.db, demoTenantId, (tx) =>
    tx
      .update(schema.cashSessions)
      .set({ status: 'closed', closedAt: new Date() })
      .where(
        and(eq(schema.cashSessions.tenantId, demoTenantId), eq(schema.cashSessions.status, 'open')),
      ),
  );
});

afterAll(async () => {
  await app.close();
  await appDb.close();
  await ownerDb.close();
});

describe('fechamento sem divergência', () => {
  it('contado bate o esperado → nenhuma cash_divergences gravada', async () => {
    const ownerCookie = await login(ownerEmail);
    const headers = { cookie: ownerCookie, 'x-tenant-id': demoTenantId };

    const openRes = await app.inject({
      method: 'POST',
      url: '/v1/cash-sessions/open',
      headers,
      payload: { openingFloatCents: 10_000 },
    });
    expect(openRes.statusCode, openRes.body).toBe(201);
    const cashSessionId = (openRes.json() as { session: { id: string } }).session.id;

    // grand_total = 5000 (item) + 500 (10% service_fee) = 5500, pago no débito.
    const { tabId } = await createTabWithOrder(5_000);
    const payRes = await app.inject({
      method: 'POST',
      url: `/v1/tabs/${tabId}/payments`,
      headers: { ...headers, 'idempotency-key': newId() },
      payload: { method: 'debit', amountCents: 5_500 },
    });
    expect(payRes.statusCode, payRes.body).toBe(201);

    const closeRes = await app.inject({
      method: 'POST',
      url: `/v1/cash-sessions/${cashSessionId}/close`,
      headers,
      payload: {
        counted: [
          { method: 'cash', amountCents: 10_000 }, // só o fundo de troco, nenhuma venda em dinheiro
          { method: 'debit', amountCents: 5_500 },
        ],
      },
    });
    expect(closeRes.statusCode, closeRes.body).toBe(200);
    const summary = (
      closeRes.json() as {
        summary: {
          status: string;
          byMethod: Array<{ method: string; expectedCents: number; differenceCents: number }>;
        };
      }
    ).summary;
    expect(summary.status).toBe('closed');
    const cash = summary.byMethod.find((m) => m.method === 'cash')!;
    const debit = summary.byMethod.find((m) => m.method === 'debit')!;
    expect(cash.expectedCents).toBe(10_000);
    expect(cash.differenceCents).toBe(0);
    expect(debit.expectedCents).toBe(5_500);
    expect(debit.differenceCents).toBe(0);

    expect(await countDivergences(cashSessionId)).toBe(0);

    // fechar de novo (idempotente) não duplica nada e devolve o mesmo resumo.
    const secondClose = await app.inject({
      method: 'POST',
      url: `/v1/cash-sessions/${cashSessionId}/close`,
      headers,
      payload: { counted: [{ method: 'cash', amountCents: 10_000 }] },
    });
    expect(secondClose.statusCode, secondClose.body).toBe(200);
    expect(await countDivergences(cashSessionId)).toBe(0);

    // sessão fechada não aceita pagamento novo.
    const { tabId: tabId2 } = await createTabWithOrder(1_000);
    const payAfterClose = await app.inject({
      method: 'POST',
      url: `/v1/tabs/${tabId2}/payments`,
      headers: { ...headers, 'idempotency-key': newId() },
      payload: { method: 'cash', amountCents: 500, tenderedCents: 500 },
    });
    expect(payAfterClose.statusCode, payAfterClose.body).toBe(409);
    expect((payAfterClose.json() as { error: { code: string } }).error.code).toBe(
      'CASH_SESSION_CLOSED',
    );

    // nem movimento novo na sessão já fechada.
    const movementAfterClose = await app.inject({
      method: 'POST',
      url: `/v1/cash-sessions/${cashSessionId}/movements`,
      headers,
      payload: { type: 'withdrawal', method: 'cash', amountCents: 100, reason: 'Teste' },
    });
    expect(movementAfterClose.statusCode).toBe(409);
    expect((movementAfterClose.json() as { error: { code: string } }).error.code).toBe(
      'CASH_SESSION_CLOSED',
    );
  });
});

describe('fechamento com sangria e divergência', () => {
  it('sangria entra no esperado; contado errado gera cash_divergences com a diferença exata', async () => {
    const ownerCookie = await login(ownerEmail);
    const headers = { cookie: ownerCookie, 'x-tenant-id': demoTenantId };

    const openRes = await app.inject({
      method: 'POST',
      url: '/v1/cash-sessions/open',
      headers,
      payload: { openingFloatCents: 0 },
    });
    const cashSessionId = (openRes.json() as { session: { id: string } }).session.id;

    const { tabId } = await createTabWithOrder(3_000);
    const payRes = await app.inject({
      method: 'POST',
      url: `/v1/tabs/${tabId}/payments`,
      headers: { ...headers, 'idempotency-key': newId() },
      payload: { method: 'cash', amountCents: 3_300, tenderedCents: 3_300 }, // 3000 + 10% = 3300
    });
    expect(payRes.statusCode, payRes.body).toBe(201);

    const movementRes = await app.inject({
      method: 'POST',
      url: `/v1/cash-sessions/${cashSessionId}/movements`,
      headers,
      payload: { type: 'withdrawal', method: 'cash', amountCents: 1_000, reason: 'Sangria' },
    });
    expect(movementRes.statusCode, movementRes.body).toBe(201);

    // esperado em dinheiro = 0 (abertura) + 3300 (venda) - 1000 (sangria) = 2300.
    // operador conta 1800 na gaveta -> diferença de -500.
    const closeRes = await app.inject({
      method: 'POST',
      url: `/v1/cash-sessions/${cashSessionId}/close`,
      headers,
      payload: { counted: [{ method: 'cash', amountCents: 1_800 }] },
    });
    expect(closeRes.statusCode, closeRes.body).toBe(200);
    const summary = (
      closeRes.json() as {
        summary: {
          byMethod: Array<{ method: string; expectedCents: number; differenceCents: number }>;
        };
      }
    ).summary;
    const cash = summary.byMethod.find((m) => m.method === 'cash')!;
    expect(cash.expectedCents).toBe(2_300);
    expect(cash.differenceCents).toBe(-500);

    expect(await countDivergences(cashSessionId)).toBe(1);
    const divergenceRow = (
      await withTenant(ownerDb.db, demoTenantId, (tx) =>
        tx
          .select()
          .from(schema.cashDivergences)
          .where(eq(schema.cashDivergences.cashSessionId, cashSessionId)),
      )
    )[0]!;
    expect(divergenceRow.expectedCents).toBe(2_300);
    expect(divergenceRow.countedCents).toBe(1_800);
    expect(divergenceRow.differenceCents).toBe(-500);

    // fechar de novo não duplica a divergência já gravada.
    await app.inject({
      method: 'POST',
      url: `/v1/cash-sessions/${cashSessionId}/close`,
      headers,
      payload: { counted: [{ method: 'cash', amountCents: 1_800 }] },
    });
    expect(await countDivergences(cashSessionId)).toBe(1);
  });
});

describe('negativo/isolamento', () => {
  it('sem cash.close/cash.movement → 403', async () => {
    const ownerCookie = await login(ownerEmail);
    const openRes = await app.inject({
      method: 'POST',
      url: '/v1/cash-sessions/open',
      headers: { cookie: ownerCookie, 'x-tenant-id': demoTenantId },
      payload: { openingFloatCents: 0 },
    });
    const cashSessionId = (openRes.json() as { session: { id: string } }).session.id;

    const kitchenCookie = await login(kitchenEmail);
    const kitchenHeaders = { cookie: kitchenCookie, 'x-tenant-id': demoTenantId };

    const closeDenied = await app.inject({
      method: 'POST',
      url: `/v1/cash-sessions/${cashSessionId}/close`,
      headers: kitchenHeaders,
      payload: { counted: [{ method: 'cash', amountCents: 0 }] },
    });
    expect(closeDenied.statusCode).toBe(403);

    const movementDenied = await app.inject({
      method: 'POST',
      url: `/v1/cash-sessions/${cashSessionId}/movements`,
      headers: kitchenHeaders,
      payload: { type: 'deposit', method: 'cash', amountCents: 100, reason: 'Teste' },
    });
    expect(movementDenied.statusCode).toBe(403);

    // limpa a sessão aberta para não interferir com testes seguintes deste arquivo.
    await app.inject({
      method: 'POST',
      url: `/v1/cash-sessions/${cashSessionId}/close`,
      headers: { cookie: ownerCookie, 'x-tenant-id': demoTenantId },
      payload: { counted: [{ method: 'cash', amountCents: 0 }] },
    });
  });

  it('sessão de caixa de outro tenant nunca é encontrada (404, não vaza)', async () => {
    const ownerCookie = await login(ownerEmail);
    const openRes = await app.inject({
      method: 'POST',
      url: '/v1/cash-sessions/open',
      headers: { cookie: ownerCookie, 'x-tenant-id': demoTenantId },
      payload: { openingFloatCents: 0 },
    });
    const cashSessionId = (openRes.json() as { session: { id: string } }).session.id;

    const tenantRows = await withoutTenant(ownerDb.db, (tx) =>
      tx.select({ id: schema.tenants.id, slug: schema.tenants.slug }).from(schema.tenants),
    );
    const bellaTenantId = tenantRows.find((r) => r.slug === 'bella')!.id;
    const bellaRoles = await withTenant(ownerDb.db, bellaTenantId, (tx) =>
      tx.select().from(schema.roles).where(eq(schema.roles.tenantId, bellaTenantId)),
    );
    const bellaOwnerRoleId = bellaRoles.find((r) => r.name === 'owner')!.id;
    const bellaOwnerEmail = `m14-bella-${newId()}@example.com`;
    const signUp = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: { name: 'Dono Bella M14', email: bellaOwnerEmail, password },
    });
    const bellaUserId = (signUp.json() as { user: { id: string } }).user.id;
    await withTenant(ownerDb.db, bellaTenantId, (tx) =>
      tx.insert(schema.memberships).values({
        id: newId(),
        userId: bellaUserId,
        tenantId: bellaTenantId,
        roleId: bellaOwnerRoleId,
      }),
    );
    const bellaCookie = await login(bellaOwnerEmail);
    const bellaHeaders = { cookie: bellaCookie, 'x-tenant-id': bellaTenantId };

    const closeRes = await app.inject({
      method: 'POST',
      url: `/v1/cash-sessions/${cashSessionId}/close`,
      headers: bellaHeaders,
      payload: { counted: [{ method: 'cash', amountCents: 0 }] },
    });
    expect(closeRes.statusCode).toBe(404);

    const movementRes = await app.inject({
      method: 'POST',
      url: `/v1/cash-sessions/${cashSessionId}/movements`,
      headers: bellaHeaders,
      payload: { type: 'deposit', method: 'cash', amountCents: 100, reason: 'Teste' },
    });
    expect(movementRes.statusCode).toBe(404);
  });
});
