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
 * KDS (M9, ACTIVE_PLAN.md): tickets aparecem só na estação certa do dispositivo,
 * transições são atômicas e idempotentes (dois KDS bumpando o mesmo ticket nunca
 * erram). Roda contra Postgres real na CI, API conectada como `bella_app`.
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

const ownerEmail = `kds-owner-${newId()}@example.com`;
const password = 'senha-forte-kds-000';

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

async function pairKdsDevice(stationIds: string[]): Promise<string> {
  const cookie = await login(ownerEmail);
  const createRes = await app.inject({
    method: 'POST',
    url: '/v1/devices/pairing-codes',
    headers: { cookie, 'x-tenant-id': bellaTenantId },
    payload: { deviceKind: 'kds', deviceName: `KDS ${newId().slice(-6)}`, stationIds },
  });
  const { code } = createRes.json() as { code: string };
  const exchangeRes = await app.inject({
    method: 'POST',
    url: '/v1/devices/exchange',
    payload: { code },
  });
  const { token } = exchangeRes.json() as { token: string };
  return token;
}

async function createOrderWithProduct(): Promise<{ ticketId: string; stationId: string }> {
  const cookie = await login(ownerEmail);
  const suffix = newId().slice(-8);
  const headers = { cookie, 'x-tenant-id': bellaTenantId };
  const stationRes = await app.inject({
    method: 'POST',
    url: '/v1/catalog/stations',
    headers,
    payload: { name: `Estação KDS ${suffix}` },
  });
  const stationId = (stationRes.json() as { station: { id: string } }).station.id;
  const categoryRes = await app.inject({
    method: 'POST',
    url: '/v1/catalog/categories',
    headers,
    payload: { name: `Categoria KDS ${suffix}` },
  });
  const categoryId = (categoryRes.json() as { category: { id: string } }).category.id;
  const productRes = await app.inject({
    method: 'POST',
    url: '/v1/catalog/products',
    headers,
    payload: { categoryId, stationId, name: `Produto KDS ${suffix}`, basePriceCents: 1500 },
  });
  const productId = (productRes.json() as { product: { id: string } }).product.id;

  const tableRes = await app.inject({
    method: 'POST',
    url: '/v1/tables',
    headers,
    payload: { label: `Mesa KDS ${suffix}` },
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
  const orderBody = orderRes.json() as { order: { id: string } };

  const ticketRows = await withTenant(ownerDb.db, bellaTenantId, (tx) =>
    tx
      .select()
      .from(schema.productionTickets)
      .where(eq(schema.productionTickets.orderId, orderBody.order.id)),
  );
  return { ticketId: ticketRows[0]!.id, stationId };
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
  const bellaOwnerRoleId = bellaRoles.find((r) => r.name === 'owner')!.id;
  const ownerSignUp = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    payload: { name: 'Dono KDS', email: ownerEmail, password },
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

describe('KDS — listagem e transição de ticket', () => {
  it('KDS só vê tickets da própria estação', async () => {
    const { ticketId, stationId } = await createOrderWithProduct();
    const kdsToken = await pairKdsDevice([stationId]);

    const listRes = await app.inject({
      method: 'GET',
      url: '/v1/kds/tickets',
      headers: { 'x-device-token': kdsToken },
    });
    expect(listRes.statusCode, listRes.body).toBe(200);
    const { tickets } = listRes.json() as { tickets: Array<{ id: string }> };
    expect(tickets.some((t) => t.id === ticketId)).toBe(true);

    const otherKdsToken = await pairKdsDevice([newId()]); // estação inexistente = nenhum ticket
    const otherListRes = await app.inject({
      method: 'GET',
      url: '/v1/kds/tickets',
      headers: { 'x-device-token': otherKdsToken },
    });
    const otherTickets = (otherListRes.json() as { tickets: Array<{ id: string }> }).tickets;
    expect(otherTickets.some((t) => t.id === ticketId)).toBe(false);
  });

  it('transições válidas funcionam e transição inválida é rejeitada', async () => {
    const { ticketId, stationId } = await createOrderWithProduct();
    const kdsToken = await pairKdsDevice([stationId]);

    const readyBeforeStart = await app.inject({
      method: 'POST',
      url: `/v1/kds/tickets/${ticketId}/ready`,
      headers: { 'x-device-token': kdsToken },
    });
    expect(readyBeforeStart.statusCode).toBe(409);

    const startRes = await app.inject({
      method: 'POST',
      url: `/v1/kds/tickets/${ticketId}/start`,
      headers: { 'x-device-token': kdsToken },
    });
    expect(startRes.statusCode, startRes.body).toBe(200);
    expect((startRes.json() as { ticket: { status: string } }).ticket.status).toBe('preparing');

    const readyRes = await app.inject({
      method: 'POST',
      url: `/v1/kds/tickets/${ticketId}/ready`,
      headers: { 'x-device-token': kdsToken },
    });
    expect(readyRes.statusCode, readyRes.body).toBe(200);
    expect((readyRes.json() as { ticket: { status: string } }).ticket.status).toBe('ready');
  });

  it('bump idempotente: chamar /start duas vezes não é erro', async () => {
    const { ticketId, stationId } = await createOrderWithProduct();
    const kdsToken = await pairKdsDevice([stationId]);

    const first = await app.inject({
      method: 'POST',
      url: `/v1/kds/tickets/${ticketId}/start`,
      headers: { 'x-device-token': kdsToken },
    });
    expect(first.statusCode, first.body).toBe(200);

    const second = await app.inject({
      method: 'POST',
      url: `/v1/kds/tickets/${ticketId}/start`,
      headers: { 'x-device-token': kdsToken },
    });
    expect(second.statusCode, second.body).toBe(200);
    expect((second.json() as { ticket: { status: string } }).ticket.status).toBe('preparing');
  });

  it('dispositivo de outra estação não consegue transicionar o ticket', async () => {
    const { ticketId } = await createOrderWithProduct();
    const otherKdsToken = await pairKdsDevice([newId()]);

    const res = await app.inject({
      method: 'POST',
      url: `/v1/kds/tickets/${ticketId}/start`,
      headers: { 'x-device-token': otherKdsToken },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('expedição (M10) — GET /v1/tickets/ready, visão de staff', () => {
  it('ticket marcado como ready pelo KDS aparece na expedição de qualquer staff', async () => {
    const { ticketId, stationId } = await createOrderWithProduct();
    const kdsToken = await pairKdsDevice([stationId]);
    await app.inject({
      method: 'POST',
      url: `/v1/kds/tickets/${ticketId}/start`,
      headers: { 'x-device-token': kdsToken },
    });
    await app.inject({
      method: 'POST',
      url: `/v1/kds/tickets/${ticketId}/ready`,
      headers: { 'x-device-token': kdsToken },
    });

    const cookie = await login(ownerEmail);
    const readyRes = await app.inject({
      method: 'GET',
      url: '/v1/tickets/ready',
      headers: { cookie, 'x-tenant-id': bellaTenantId },
    });
    expect(readyRes.statusCode, readyRes.body).toBe(200);
    const tickets = (readyRes.json() as { tickets: Array<{ id: string }> }).tickets;
    expect(tickets.some((t) => t.id === ticketId)).toBe(true);
  });
});
