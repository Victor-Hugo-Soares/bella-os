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
 * SSE (M9, ACTIVE_PLAN.md). `fastify.inject()` não serve para testar um stream de
 * verdade (a injeção espera a resposta terminar) — este teste sobe o servidor de
 * verdade (`app.listen()`) e lê a resposta com `fetch` real, exatamente como um
 * browser faria, abortando a conexão quando já tiver o suficiente para a asserção
 * (regra 12: pesquisado antes de escrever, não assumido).
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
let baseUrl: string;
let bellaTenantId: string;
let bellaTenantSlug: string;

const ownerEmail = `realtime-owner-${newId()}@example.com`;
const password = 'senha-forte-realtime-000';

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
  const address = await app.listen({ port: 0, host: '127.0.0.1' });
  baseUrl = address;

  const bellaRoles = await withTenant(ownerDb.db, bellaTenantId, (tx) =>
    tx.select().from(schema.roles).where(eq(schema.roles.tenantId, bellaTenantId)),
  );
  const bellaOwnerRoleId = bellaRoles.find((r) => r.name === 'owner')!.id;
  const ownerSignUp = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    payload: { name: 'Dono Realtime', email: ownerEmail, password },
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

async function pairKdsDevice(): Promise<string> {
  const cookie = await login(ownerEmail);
  const createRes = await app.inject({
    method: 'POST',
    url: '/v1/devices/pairing-codes',
    headers: { cookie, 'x-tenant-id': bellaTenantId },
    payload: { deviceKind: 'kds', deviceName: `KDS Realtime ${newId().slice(-6)}` },
  });
  const { code } = createRes.json() as { code: string };
  const exchangeRes = await app.inject({
    method: 'POST',
    url: '/v1/devices/exchange',
    payload: { code },
  });
  return (exchangeRes.json() as { token: string }).token;
}

describe('GET /v1/stream (SSE real)', () => {
  it('emite um evento order.created pouco depois de um pedido ser criado', async () => {
    const kdsToken = await pairKdsDevice();

    const controller = new AbortController();
    const streamRes = await fetch(`${baseUrl}/v1/stream`, {
      headers: { 'x-device-token': kdsToken },
      signal: controller.signal,
    });
    expect(streamRes.status).toBe(200);
    expect(streamRes.headers.get('content-type')).toContain('text/event-stream');
    const reader = streamRes.body!.getReader();
    const decoder = new TextDecoder();

    // Cria o pedido DEPOIS de a conexão SSE já estar aberta — prova que o evento
    // chega pelo stream, não é só o replay inicial de `Last-Event-ID`.
    const ownerCookie = await login(ownerEmail);
    const suffix = newId().slice(-8);
    const headers = { cookie: ownerCookie, 'x-tenant-id': bellaTenantId };
    const stationRes = await app.inject({
      method: 'POST',
      url: '/v1/catalog/stations',
      headers,
      payload: { name: `Estação Realtime ${suffix}` },
    });
    const stationId = (stationRes.json() as { station: { id: string } }).station.id;
    const categoryRes = await app.inject({
      method: 'POST',
      url: '/v1/catalog/categories',
      headers,
      payload: { name: `Categoria Realtime ${suffix}` },
    });
    const categoryId = (categoryRes.json() as { category: { id: string } }).category.id;
    const productRes = await app.inject({
      method: 'POST',
      url: '/v1/catalog/products',
      headers,
      payload: { categoryId, stationId, name: `Produto Realtime ${suffix}`, basePriceCents: 1000 },
    });
    const productId = (productRes.json() as { product: { id: string } }).product.id;
    const tableRes = await app.inject({
      method: 'POST',
      url: '/v1/tables',
      headers,
      payload: { label: `Mesa Realtime ${suffix}` },
    });
    const table = (tableRes.json() as { table: { qrCode: string } }).table;
    const openRes = await app.inject({
      method: 'POST',
      url: `/public/${bellaTenantSlug}/tables/${table.qrCode}/session`,
    });
    const guestCookie = extractGuestCookie(openRes);
    await app.inject({
      method: 'POST',
      url: `/public/${bellaTenantSlug}/orders`,
      headers: { cookie: guestCookie, 'idempotency-key': newId() },
      payload: { items: [{ productId, quantity: 1 }] },
    });

    let received = '';
    const deadline = Date.now() + 10_000;
    while (!received.includes('order.created') && Date.now() < deadline) {
      const { value, done } = await reader.read();
      if (done) break;
      received += decoder.decode(value, { stream: true });
    }
    controller.abort();

    expect(received).toContain('event: order.created');
  }, 15_000);
});
