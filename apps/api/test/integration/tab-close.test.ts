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
 * Fechar comanda e sugestão de divisão (M15, ACTIVE_PLAN.md) — **CRÍTICO** (dinheiro/
 * comanda, regra 2 do CLAUDE.md): 3 frentes. Roda contra Postgres real na CI, API
 * conectada como `bella_app`. Usa o tenant **demo** e limpa qualquer sessão de caixa
 * residual no início (mesma defesa do M14) — `payments.test.ts`/`cash-close.test.ts`
 * deixam sessões abertas de propósito em seus próprios testes de isolamento.
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

const ownerEmail = `m15-owner-${newId()}@example.com`;
const kitchenEmail = `m15-kitchen-${newId()}@example.com`;
const password = 'senha-forte-m15-000';

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

async function createTabWithOrder(priceCents: number): Promise<{ tabId: string }> {
  const ownerCookie = await login(ownerEmail);
  const suffix = newId().slice(-8);
  const headers = { cookie: ownerCookie, 'x-tenant-id': demoTenantId };

  const stationRes = await app.inject({
    method: 'POST',
    url: '/v1/catalog/stations',
    headers,
    payload: { name: `Estação M15 ${suffix}` },
  });
  const stationId = (stationRes.json() as { station: { id: string } }).station.id;
  const categoryRes = await app.inject({
    method: 'POST',
    url: '/v1/catalog/categories',
    headers,
    payload: { name: `Categoria M15 ${suffix}` },
  });
  const categoryId = (categoryRes.json() as { category: { id: string } }).category.id;
  const productRes = await app.inject({
    method: 'POST',
    url: '/v1/catalog/products',
    headers,
    payload: { categoryId, stationId, name: `Produto M15 ${suffix}`, basePriceCents: priceCents },
  });
  const productId = (productRes.json() as { product: { id: string } }).product.id;

  const tableRes = await app.inject({
    method: 'POST',
    url: '/v1/tables',
    headers,
    payload: { label: `Mesa M15 ${suffix}` },
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

/** Paga a comanda integralmente (crédito, sem troco) usando a sessão de caixa da suíte. */
async function payFully(tabId: string, amountCents: number): Promise<void> {
  const ownerCookie = await login(ownerEmail);
  const res = await app.inject({
    method: 'POST',
    url: `/v1/tabs/${tabId}/payments`,
    headers: {
      cookie: ownerCookie,
      'x-tenant-id': demoTenantId,
      'idempotency-key': newId(),
    },
    payload: { method: 'credit', amountCents },
  });
  if (res.statusCode !== 201) throw new Error(`pagamento falhou: ${res.body}`);
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
    [ownerEmail, 'Dono M15', ownerRoleId],
    [kitchenEmail, 'Cozinha M15', kitchenRoleId],
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

  // Defesa contra estado residual de outros arquivos (mesmo princípio do M14).
  await withTenant(ownerDb.db, demoTenantId, (tx) =>
    tx
      .update(schema.cashSessions)
      .set({ status: 'closed', closedAt: new Date() })
      .where(
        and(eq(schema.cashSessions.tenantId, demoTenantId), eq(schema.cashSessions.status, 'open')),
      ),
  );
  const ownerCookie = await login(ownerEmail);
  const openRes = await app.inject({
    method: 'POST',
    url: '/v1/cash-sessions/open',
    headers: { cookie: ownerCookie, 'x-tenant-id': demoTenantId },
    payload: { openingFloatCents: 0 },
  });
  if (openRes.statusCode !== 201) throw new Error(`abrir sessão de caixa falhou: ${openRes.body}`);
});

afterAll(async () => {
  await app.close();
  await appDb.close();
  await ownerDb.close();
});

describe('POST /v1/tabs/:id/close', () => {
  it('fecha com saldo 0 e grava tab_closures; fechar de novo é idempotente', async () => {
    const { tabId } = await createTabWithOrder(4_000);
    // grand_total = 4000 + 10% = 4400.
    await payFully(tabId, 4_400);

    const ownerCookie = await login(ownerEmail);
    const headers = { cookie: ownerCookie, 'x-tenant-id': demoTenantId };

    const closeRes = await app.inject({ method: 'POST', url: `/v1/tabs/${tabId}/close`, headers });
    expect(closeRes.statusCode, closeRes.body).toBe(200);
    const closure = (closeRes.json() as { closure: { status: string; grandTotalCents: number } })
      .closure;
    expect(closure.status).toBe('closed');
    expect(closure.grandTotalCents).toBe(4_400);

    const tabRow = (
      await withTenant(ownerDb.db, demoTenantId, (tx) =>
        tx.select().from(schema.tabs).where(eq(schema.tabs.id, tabId)),
      )
    )[0]!;
    expect(tabRow.status).toBe('closed');

    const closuresCount = (
      await withTenant(ownerDb.db, demoTenantId, (tx) =>
        tx.select().from(schema.tabClosures).where(eq(schema.tabClosures.tabId, tabId)),
      )
    ).length;
    expect(closuresCount).toBe(1);

    const second = await app.inject({ method: 'POST', url: `/v1/tabs/${tabId}/close`, headers });
    expect(second.statusCode, second.body).toBe(200);
    const closuresCountAfter = (
      await withTenant(ownerDb.db, demoTenantId, (tx) =>
        tx.select().from(schema.tabClosures).where(eq(schema.tabClosures.tabId, tabId)),
      )
    ).length;
    expect(closuresCountAfter).toBe(1); // não duplica a fotografia
  });

  it('rejeita fechar com saldo pendente (409 CONFLICT), nada gravado', async () => {
    const { tabId } = await createTabWithOrder(2_000);
    const ownerCookie = await login(ownerEmail);
    const res = await app.inject({
      method: 'POST',
      url: `/v1/tabs/${tabId}/close`,
      headers: { cookie: ownerCookie, 'x-tenant-id': demoTenantId },
    });
    expect(res.statusCode).toBe(409);
    expect((res.json() as { error: { code: string } }).error.code).toBe('CONFLICT');

    const closuresCount = (
      await withTenant(ownerDb.db, demoTenantId, (tx) =>
        tx.select().from(schema.tabClosures).where(eq(schema.tabClosures.tabId, tabId)),
      )
    ).length;
    expect(closuresCount).toBe(0);
  });

  it('sem tabs.close → 403', async () => {
    const { tabId } = await createTabWithOrder(1_000);
    const kitchenCookie = await login(kitchenEmail);
    const res = await app.inject({
      method: 'POST',
      url: `/v1/tabs/${tabId}/close`,
      headers: { cookie: kitchenCookie, 'x-tenant-id': demoTenantId },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('GET /v1/tabs/:id/split', () => {
  it('divide o saldo restante em N partes cuja soma bate com o saldo', async () => {
    const { tabId } = await createTabWithOrder(10_000);
    // grand_total = 11000, sem pagamento ainda — balance = 11000.
    const ownerCookie = await login(ownerEmail);
    const res = await app.inject({
      method: 'GET',
      url: `/v1/tabs/${tabId}/split?parts=3`,
      headers: { cookie: ownerCookie, 'x-tenant-id': demoTenantId },
    });
    expect(res.statusCode, res.body).toBe(200);
    const split = (res.json() as { split: { balanceCents: number; shares: number[] } }).split;
    expect(split.balanceCents).toBe(11_000);
    expect(split.shares).toHaveLength(3);
    expect(split.shares.reduce((sum, s) => sum + s, 0)).toBe(11_000);
  });
});
