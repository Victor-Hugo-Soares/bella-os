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
 * Cancelamento de item (M11, ACTIVE_PLAN.md) — **CRÍTICO** (regra 2 do CLAUDE.md lista
 * "cancelamento" explicitamente): 3 frentes. Roda contra Postgres real na CI, API
 * conectada como `bella_app`.
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

const ownerEmail = `m11-owner-${newId()}@example.com`;
const waiterEmail = `m11-waiter-${newId()}@example.com`;
const kitchenEmail = `m11-kitchen-${newId()}@example.com`;
const password = 'senha-forte-m11-000';

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

function extractGuestCookie(res: { headers: Record<string, unknown> }): string {
  const setCookie = res.headers['set-cookie'];
  const raw = Array.isArray(setCookie) ? setCookie : setCookie ? [String(setCookie)] : [];
  const match = raw.map((c) => String(c)).find((c) => c.startsWith(`${GUEST_SESSION_COOKIE}=`));
  if (!match) throw new Error('cookie de sessão de mesa ausente na resposta');
  return match.split(';')[0]!;
}

interface Setup {
  orderId: string;
  itemId: string;
  productPriceCents: number;
  tabId: string;
}

async function createOrderReadyToCancel(): Promise<Setup> {
  const ownerCookie = await login(ownerEmail);
  const suffix = newId().slice(-8);
  const headers = { cookie: ownerCookie, 'x-tenant-id': bellaTenantId };
  const stationRes = await app.inject({
    method: 'POST',
    url: '/v1/catalog/stations',
    headers,
    payload: { name: `Estação M11 ${suffix}` },
  });
  const stationId = (stationRes.json() as { station: { id: string } }).station.id;
  const categoryRes = await app.inject({
    method: 'POST',
    url: '/v1/catalog/categories',
    headers,
    payload: { name: `Categoria M11 ${suffix}` },
  });
  const categoryId = (categoryRes.json() as { category: { id: string } }).category.id;
  const productRes = await app.inject({
    method: 'POST',
    url: '/v1/catalog/products',
    headers,
    payload: { categoryId, stationId, name: `Produto M11 ${suffix}`, basePriceCents: 4000 },
  });
  const productId = (productRes.json() as { product: { id: string } }).product.id;

  const tableRes = await app.inject({
    method: 'POST',
    url: '/v1/tables',
    headers,
    payload: { label: `Mesa M11 ${suffix}` },
  });
  const table = (tableRes.json() as { table: { qrCode: string } }).table;
  const openRes = await app.inject({
    method: 'POST',
    url: `/public/${bellaTenantSlug}/tables/${table.qrCode}/session`,
  });
  const guestCookie = extractGuestCookie(openRes);
  const orderRes = await app.inject({
    method: 'POST',
    url: `/public/${bellaTenantSlug}/orders`,
    headers: { cookie: guestCookie, 'idempotency-key': newId() },
    payload: { items: [{ productId, quantity: 1 }] },
  });
  const body = orderRes.json() as {
    order: { id: string };
    items: Array<{ id: string; lineTotalCents: number }>;
  };

  const orderRow = await withTenant(ownerDb.db, bellaTenantId, (tx) =>
    tx.select().from(schema.orders).where(eq(schema.orders.id, body.order.id)),
  );
  return {
    orderId: body.order.id,
    itemId: body.items[0]!.id,
    productPriceCents: body.items[0]!.lineTotalCents,
    tabId: orderRow[0]!.tabId,
  };
}

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
  const waiterRoleId = bellaRoles.find((r) => r.name === 'waiter')!.id;
  const kitchenRoleId = bellaRoles.find((r) => r.name === 'kitchen')!.id;

  for (const [email, name, roleId] of [
    [ownerEmail, 'Dono M11', ownerRoleId],
    [waiterEmail, 'Garçom M11', waiterRoleId],
    [kitchenEmail, 'Cozinha M11', kitchenRoleId],
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

describe('cancelamento antes da produção — sempre revertido', () => {
  it('reverte o saldo da comanda por completo', async () => {
    const setup = await createOrderReadyToCancel();
    const balanceBefore = await tabBalance(setup.tabId);
    expect(balanceBefore).toBe(setup.productPriceCents);

    const ownerCookie = await login(ownerEmail);
    const cancelRes = await app.inject({
      method: 'PATCH',
      url: `/v1/orders/${setup.orderId}/items/${setup.itemId}/cancel`,
      headers: { cookie: ownerCookie, 'x-tenant-id': bellaTenantId },
      payload: { stage: 'before_production', reason: 'Cliente desistiu' },
    });
    expect(cancelRes.statusCode, cancelRes.body).toBe(200);
    expect((cancelRes.json() as { item: { reversed: boolean } }).item.reversed).toBe(true);

    const balanceAfter = await tabBalance(setup.tabId);
    expect(balanceAfter).toBe(0);
  });

  it('cancelar duas vezes é idempotente — não reverte duas vezes', async () => {
    const setup = await createOrderReadyToCancel();
    const ownerCookie = await login(ownerEmail);
    const headers = { cookie: ownerCookie, 'x-tenant-id': bellaTenantId };
    const payload = { stage: 'before_production' as const, reason: 'Erro no pedido' };

    await app.inject({
      method: 'PATCH',
      url: `/v1/orders/${setup.orderId}/items/${setup.itemId}/cancel`,
      headers,
      payload,
    });
    const second = await app.inject({
      method: 'PATCH',
      url: `/v1/orders/${setup.orderId}/items/${setup.itemId}/cancel`,
      headers,
      payload,
    });
    expect(second.statusCode, second.body).toBe(200);

    const balance = await tabBalance(setup.tabId);
    expect(balance).toBe(0); // não -productPriceCents (que seria dupla reversão)
  });
});

describe('cancelamento depois da produção — decisão charge_on_cancel', () => {
  async function advanceToPreparing(setup: Setup) {
    const ownerCookie = await login(ownerEmail);
    const ticketRows = await withTenant(ownerDb.db, bellaTenantId, (tx) =>
      tx
        .select()
        .from(schema.productionTickets)
        .where(eq(schema.productionTickets.orderId, setup.orderId)),
    );
    const itemRow = await withTenant(ownerDb.db, bellaTenantId, (tx) =>
      tx.select().from(schema.orderItems).where(eq(schema.orderItems.id, setup.itemId)),
    );
    const stationId = itemRow[0]!.stationId;

    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/devices/pairing-codes',
      headers: { cookie: ownerCookie, 'x-tenant-id': bellaTenantId },
      payload: {
        deviceKind: 'kds',
        deviceName: `KDS M11 ${newId().slice(-6)}`,
        stationIds: [stationId],
      },
    });
    const { code } = createRes.json() as { code: string };
    const exchangeRes = await app.inject({
      method: 'POST',
      url: '/v1/devices/exchange',
      payload: { code },
    });
    const { token } = exchangeRes.json() as { token: string };
    await app.inject({
      method: 'POST',
      url: `/v1/kds/tickets/${ticketRows[0]!.id}/start`,
      headers: { 'x-device-token': token },
    });
  }

  it('charge_on_cancel=true (cliente paga): SEM reversão', async () => {
    const setup = await createOrderReadyToCancel();
    await advanceToPreparing(setup);
    const ownerCookie = await login(ownerEmail);

    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/orders/${setup.orderId}/items/${setup.itemId}/cancel`,
      headers: { cookie: ownerCookie, 'x-tenant-id': bellaTenantId },
      payload: { stage: 'after_production', reason: 'Cliente não quis mais', chargeOnCancel: true },
    });
    expect(res.statusCode, res.body).toBe(200);
    expect((res.json() as { item: { reversed: boolean } }).item.reversed).toBe(false);

    const balance = await tabBalance(setup.tabId);
    expect(balance).toBe(setup.productPriceCents); // continua cobrado
  });

  it('charge_on_cancel=false (cortesia/perda): COM reversão', async () => {
    const setup = await createOrderReadyToCancel();
    await advanceToPreparing(setup);
    const ownerCookie = await login(ownerEmail);

    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/orders/${setup.orderId}/items/${setup.itemId}/cancel`,
      headers: { cookie: ownerCookie, 'x-tenant-id': bellaTenantId },
      payload: { stage: 'after_production', reason: 'Erro da cozinha', chargeOnCancel: false },
    });
    expect(res.statusCode, res.body).toBe(200);
    expect((res.json() as { item: { reversed: boolean } }).item.reversed).toBe(true);

    const balance = await tabBalance(setup.tabId);
    expect(balance).toBe(0);
  });
});

describe('negativo: permissão e isolamento', () => {
  it('sem orders.cancel.before_production → 403', async () => {
    const setup = await createOrderReadyToCancel();
    const kitchenCookie = await login(kitchenEmail);
    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/orders/${setup.orderId}/items/${setup.itemId}/cancel`,
      headers: { cookie: kitchenCookie, 'x-tenant-id': bellaTenantId },
      payload: { stage: 'before_production', reason: 'Teste' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('waiter TEM orders.cancel.before_production (positivo)', async () => {
    const setup = await createOrderReadyToCancel();
    const waiterCookie = await login(waiterEmail);
    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/orders/${setup.orderId}/items/${setup.itemId}/cancel`,
      headers: { cookie: waiterCookie, 'x-tenant-id': bellaTenantId },
      payload: { stage: 'before_production', reason: 'Item errado' },
    });
    expect(res.statusCode, res.body).toBe(200);
  });

  it('item de outro tenant nunca é encontrado (404, não vaza)', async () => {
    const setup = await createOrderReadyToCancel();
    const demoOwnerEmail = `m11-demo-${newId()}@example.com`;
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
      payload: { name: 'Dono Demo M11', email: demoOwnerEmail, password },
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
    const res = await app.inject({
      method: 'PATCH',
      url: `/v1/orders/${setup.orderId}/items/${setup.itemId}/cancel`,
      headers: { cookie: demoCookie, 'x-tenant-id': demoTenantId },
      payload: { stage: 'before_production', reason: 'Teste cross-tenant' },
    });
    expect(res.statusCode).toBe(404);
  });
});
