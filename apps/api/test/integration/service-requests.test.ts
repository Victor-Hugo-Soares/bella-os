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
 * Chamados (call_waiter/request_bill) e aceitar/rejeitar pedido (M10,
 * ACTIVE_PLAN.md). Roda contra Postgres real na CI, API conectada como `bella_app`.
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
let demoTenantId: string;

const ownerEmail = `m10-owner-${newId()}@example.com`;
const password = 'senha-forte-m10-000';

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

async function openTableSession(): Promise<string> {
  const suffix = newId().slice(-8);
  const ownerCookie = await login(ownerEmail);
  const tableRes = await app.inject({
    method: 'POST',
    url: '/v1/tables',
    headers: { cookie: ownerCookie, 'x-tenant-id': bellaTenantId },
    payload: { label: `Mesa M10 ${suffix}` },
  });
  const table = (tableRes.json() as { table: { qrCode: string } }).table;
  const openRes = await app.inject({
    method: 'POST',
    url: `/public/${bellaTenantSlug}/tables/${table.qrCode}/session`,
  });
  return extractGuestCookie(openRes);
}

beforeAll(async () => {
  await runMigrations(ownerUrl);
  await setAppRolePassword(ownerUrl, appPassword);
  ownerDb = createDb(ownerUrl, { max: 4 });
  appDb = createDb(appUrl, { max: 4 });
  await seed(ownerDb.db);

  const bellaSpec = SEED_TENANTS.find((t) => t.slug === 'bella')!;
  const demoSpec = SEED_TENANTS.find((t) => t.slug === 'demo')!;
  bellaTenantSlug = bellaSpec.slug;
  const tenantRows = await withoutTenant(ownerDb.db, (tx) =>
    tx.select({ id: schema.tenants.id, slug: schema.tenants.slug }).from(schema.tenants),
  );
  bellaTenantId = tenantRows.find((r) => r.slug === bellaSpec.slug)!.id;
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

  const bellaRoles = await withTenant(ownerDb.db, bellaTenantId, (tx) =>
    tx.select().from(schema.roles).where(eq(schema.roles.tenantId, bellaTenantId)),
  );
  const bellaOwnerRoleId = bellaRoles.find((r) => r.name === 'owner')!.id;
  const ownerSignUp = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    payload: { name: 'Dono M10', email: ownerEmail, password },
  });
  const ownerUserId = (ownerSignUp.json() as { user: { id: string } }).user.id;
  await withTenant(ownerDb.db, bellaTenantId, (tx) =>
    tx.insert(schema.memberships).values({
      id: newId(),
      userId: ownerUserId,
      tenantId: bellaTenantId,
      roleId: bellaOwnerRoleId,
    }),
  );
});

afterAll(async () => {
  await app.close();
  await appDb.close();
  await ownerDb.close();
});

describe('chamados (service_requests)', () => {
  it('cliente chama garçom; staff vê e atende; chamado some da lista de abertos', async () => {
    const guestCookie = await openTableSession();
    const createRes = await app.inject({
      method: 'POST',
      url: `/public/${bellaTenantSlug}/service-requests`,
      headers: { cookie: guestCookie },
      payload: { kind: 'call_waiter' },
    });
    expect(createRes.statusCode, createRes.body).toBe(200);
    const requestId = (createRes.json() as { serviceRequest: { id: string } }).serviceRequest.id;

    const ownerCookie = await login(ownerEmail);
    const listRes = await app.inject({
      method: 'GET',
      url: '/v1/service-requests',
      headers: { cookie: ownerCookie, 'x-tenant-id': bellaTenantId },
    });
    const open = (listRes.json() as { serviceRequests: Array<{ id: string }> }).serviceRequests;
    expect(open.some((r) => r.id === requestId)).toBe(true);

    const doneRes = await app.inject({
      method: 'PATCH',
      url: `/v1/service-requests/${requestId}/done`,
      headers: { cookie: ownerCookie, 'x-tenant-id': bellaTenantId },
    });
    expect(doneRes.statusCode, doneRes.body).toBe(200);

    const listAfterRes = await app.inject({
      method: 'GET',
      url: '/v1/service-requests',
      headers: { cookie: ownerCookie, 'x-tenant-id': bellaTenantId },
    });
    const openAfter = (listAfterRes.json() as { serviceRequests: Array<{ id: string }> })
      .serviceRequests;
    expect(openAfter.some((r) => r.id === requestId)).toBe(false);
  });

  it('marcar como concluído duas vezes é idempotente (não erra)', async () => {
    const guestCookie = await openTableSession();
    const createRes = await app.inject({
      method: 'POST',
      url: `/public/${bellaTenantSlug}/service-requests`,
      headers: { cookie: guestCookie },
      payload: { kind: 'request_bill' },
    });
    const requestId = (createRes.json() as { serviceRequest: { id: string } }).serviceRequest.id;
    const ownerCookie = await login(ownerEmail);

    const first = await app.inject({
      method: 'PATCH',
      url: `/v1/service-requests/${requestId}/done`,
      headers: { cookie: ownerCookie, 'x-tenant-id': bellaTenantId },
    });
    expect(first.statusCode, first.body).toBe(200);
    const second = await app.inject({
      method: 'PATCH',
      url: `/v1/service-requests/${requestId}/done`,
      headers: { cookie: ownerCookie, 'x-tenant-id': bellaTenantId },
    });
    expect(second.statusCode, second.body).toBe(200);
  });

  it('chamado de um tenant não aparece na lista de outro tenant', async () => {
    const guestCookie = await openTableSession();
    const createRes = await app.inject({
      method: 'POST',
      url: `/public/${bellaTenantSlug}/service-requests`,
      headers: { cookie: guestCookie },
      payload: { kind: 'call_waiter' },
    });
    const requestId = (createRes.json() as { serviceRequest: { id: string } }).serviceRequest.id;

    const demoOwnerEmail = `m10-demo-${newId()}@example.com`;
    const demoRoles = await withTenant(ownerDb.db, demoTenantId, (tx) =>
      tx.select().from(schema.roles).where(eq(schema.roles.tenantId, demoTenantId)),
    );
    const demoOwnerRoleId = demoRoles.find((r) => r.name === 'owner')!.id;
    const demoSignUp = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: { name: 'Dono Demo M10', email: demoOwnerEmail, password },
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
    const demoListRes = await app.inject({
      method: 'GET',
      url: '/v1/service-requests',
      headers: { cookie: demoCookie, 'x-tenant-id': demoTenantId },
    });
    const demoIds = (
      demoListRes.json() as { serviceRequests: Array<{ id: string }> }
    ).serviceRequests.map((r) => r.id);
    expect(demoIds).not.toContain(requestId);
  });
});

describe('aceitar/rejeitar pedido', () => {
  async function createPendingOrder(): Promise<{ orderId: string; guestCookie: string }> {
    const ownerCookie = await login(ownerEmail);
    const suffix = newId().slice(-8);
    const headers = { cookie: ownerCookie, 'x-tenant-id': bellaTenantId };
    const stationRes = await app.inject({
      method: 'POST',
      url: '/v1/catalog/stations',
      headers,
      payload: { name: `Estação M10 ${suffix}` },
    });
    const stationId = (stationRes.json() as { station: { id: string } }).station.id;
    const categoryRes = await app.inject({
      method: 'POST',
      url: '/v1/catalog/categories',
      headers,
      payload: { name: `Categoria M10 ${suffix}` },
    });
    const categoryId = (categoryRes.json() as { category: { id: string } }).category.id;
    const productRes = await app.inject({
      method: 'POST',
      url: '/v1/catalog/products',
      headers,
      payload: { categoryId, stationId, name: `Produto M10 ${suffix}`, basePriceCents: 2000 },
    });
    const productId = (productRes.json() as { product: { id: string } }).product.id;
    const guestCookie = await openTableSession();
    const orderRes = await app.inject({
      method: 'POST',
      url: `/public/${bellaTenantSlug}/orders`,
      headers: { cookie: guestCookie, 'idempotency-key': newId() },
      payload: { items: [{ productId, quantity: 1 }] },
    });
    const orderId = (orderRes.json() as { order: { id: string; status: string } }).order.id;
    return { orderId, guestCookie };
  }

  it('pedido de cliente nasce submitted; aceitar muda para accepted e aparece no acompanhamento', async () => {
    const { orderId, guestCookie } = await createPendingOrder();
    const ownerCookie = await login(ownerEmail);

    const acceptRes = await app.inject({
      method: 'PATCH',
      url: `/v1/orders/${orderId}/accept`,
      headers: { cookie: ownerCookie, 'x-tenant-id': bellaTenantId },
    });
    expect(acceptRes.statusCode, acceptRes.body).toBe(200);
    expect((acceptRes.json() as { order: { status: string } }).order.status).toBe('accepted');

    const myOrdersRes = await app.inject({
      method: 'GET',
      url: `/public/${bellaTenantSlug}/orders`,
      headers: { cookie: guestCookie },
    });
    const orders = (myOrdersRes.json() as { orders: Array<{ id: string; status: string }> }).orders;
    const mine = orders.find((o) => o.id === orderId);
    expect(mine?.status).toBe('accepted');
  });

  it('rejeitar funciona; aceitar depois de rejeitado não muda o estado (idempotente pelo estado atual)', async () => {
    const { orderId } = await createPendingOrder();
    const ownerCookie = await login(ownerEmail);

    const rejectRes = await app.inject({
      method: 'PATCH',
      url: `/v1/orders/${orderId}/reject`,
      headers: { cookie: ownerCookie, 'x-tenant-id': bellaTenantId },
    });
    expect(rejectRes.statusCode, rejectRes.body).toBe(200);
    expect((rejectRes.json() as { order: { status: string } }).order.status).toBe('rejected');

    const acceptAfterRes = await app.inject({
      method: 'PATCH',
      url: `/v1/orders/${orderId}/accept`,
      headers: { cookie: ownerCookie, 'x-tenant-id': bellaTenantId },
    });
    expect(acceptAfterRes.statusCode, acceptAfterRes.body).toBe(200);
    // Não sai de 'rejected' (não é 'submitted'), então o UPDATE não afeta nada e o
    // estado atual (rejected) é devolvido, não um erro nem uma mudança indevida.
    expect((acceptAfterRes.json() as { order: { status: string } }).order.status).toBe('rejected');
  });

  it('cliente só vê pedidos da própria sessão de mesa', async () => {
    const { guestCookie: cookieA } = await createPendingOrder();
    const { orderId: orderIdB } = await createPendingOrder();

    const myOrdersRes = await app.inject({
      method: 'GET',
      url: `/public/${bellaTenantSlug}/orders`,
      headers: { cookie: cookieA },
    });
    const orders = (myOrdersRes.json() as { orders: Array<{ id: string }> }).orders;
    expect(orders.some((o) => o.id === orderIdB)).toBe(false);
  });
});
