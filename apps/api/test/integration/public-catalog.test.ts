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

/**
 * Cardápio público (M7, ACTIVE_PLAN.md): `GET /public/:tenantSlug/catalog` nunca
 * expõe produto desativado/esgotado nem dado de outro tenant. Roda contra Postgres
 * real na CI, API conectada como `bella_app`.
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
let demoTenantSlug: string;

const ownerEmail = `public-catalog-owner-${newId()}@example.com`;
const password = 'senha-forte-public-000';

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

beforeAll(async () => {
  await runMigrations(ownerUrl);
  await setAppRolePassword(ownerUrl, appPassword);
  ownerDb = createDb(ownerUrl, { max: 2 });
  appDb = createDb(appUrl, { max: 2 });
  await seed(ownerDb.db);

  const bellaSpec = SEED_TENANTS.find((t) => t.slug === 'bella')!;
  const demoSpec = SEED_TENANTS.find((t) => t.slug === 'demo')!;
  bellaTenantSlug = bellaSpec.slug;
  demoTenantSlug = demoSpec.slug;
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
    payload: { name: 'Dono Cardápio Público', email: ownerEmail, password },
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

describe('GET /public/:tenantSlug/catalog', () => {
  it('mostra só categoria ativa e produto ativo+disponível; nunca o desativado/esgotado', async () => {
    const cookie = await login(ownerEmail);
    const headers = { cookie, 'x-tenant-id': bellaTenantId };
    const suffix = newId().slice(0, 8);

    const stationRes = await app.inject({
      method: 'POST',
      url: '/v1/catalog/stations',
      headers,
      payload: { name: `Estação Pública ${suffix}` },
    });
    const stationId = (stationRes.json() as { station: { id: string } }).station.id;

    const categoryRes = await app.inject({
      method: 'POST',
      url: '/v1/catalog/categories',
      headers,
      payload: { name: `Categoria Pública ${suffix}` },
    });
    const categoryId = (categoryRes.json() as { category: { id: string } }).category.id;

    const visibleRes = await app.inject({
      method: 'POST',
      url: '/v1/catalog/products',
      headers,
      payload: { categoryId, stationId, name: `Visível ${suffix}`, basePriceCents: 1990 },
    });
    const visibleId = (visibleRes.json() as { product: { id: string } }).product.id;

    const unavailableRes = await app.inject({
      method: 'POST',
      url: '/v1/catalog/products',
      headers,
      payload: { categoryId, stationId, name: `Esgotado ${suffix}`, basePriceCents: 1990 },
    });
    const unavailableId = (unavailableRes.json() as { product: { id: string } }).product.id;
    await app.inject({
      method: 'PATCH',
      url: `/v1/catalog/products/${unavailableId}/availability`,
      headers,
      payload: { isAvailable: false },
    });

    const inactiveRes = await app.inject({
      method: 'POST',
      url: '/v1/catalog/products',
      headers,
      payload: { categoryId, stationId, name: `Desativado ${suffix}`, basePriceCents: 1990 },
    });
    const inactiveId = (inactiveRes.json() as { product: { id: string } }).product.id;
    await app.inject({
      method: 'PATCH',
      url: `/v1/catalog/products/${inactiveId}`,
      headers,
      payload: { isActive: false },
    });

    const publicRes = await app.inject({
      method: 'GET',
      url: `/public/${bellaTenantSlug}/catalog`,
    });
    expect(publicRes.statusCode, publicRes.body).toBe(200);
    const body = publicRes.json() as {
      categories: Array<{ id: string }>;
      products: Array<{ id: string }>;
    };
    const productIds = body.products.map((p) => p.id);
    expect(productIds).toContain(visibleId);
    expect(productIds).not.toContain(unavailableId);
    expect(productIds).not.toContain(inactiveId);
    expect(body.categories.some((c) => c.id === categoryId)).toBe(true);
  });

  it('nunca mistura produto de outro tenant', async () => {
    const cookie = await login(ownerEmail);
    const suffix = newId().slice(0, 8);
    const stationRes = await app.inject({
      method: 'POST',
      url: '/v1/catalog/stations',
      headers: { cookie, 'x-tenant-id': bellaTenantId },
      payload: { name: `Estação Isolamento Pub ${suffix}` },
    });
    const stationId = (stationRes.json() as { station: { id: string } }).station.id;
    const categoryRes = await app.inject({
      method: 'POST',
      url: '/v1/catalog/categories',
      headers: { cookie, 'x-tenant-id': bellaTenantId },
      payload: { name: `Categoria Isolamento Pub ${suffix}` },
    });
    const categoryId = (categoryRes.json() as { category: { id: string } }).category.id;
    const productRes = await app.inject({
      method: 'POST',
      url: '/v1/catalog/products',
      headers: { cookie, 'x-tenant-id': bellaTenantId },
      payload: { categoryId, stationId, name: `Só do Bella Pub ${suffix}`, basePriceCents: 2500 },
    });
    const productId = (productRes.json() as { product: { id: string } }).product.id;

    const demoRes = await app.inject({
      method: 'GET',
      url: `/public/${demoTenantSlug}/catalog`,
    });
    expect(demoRes.statusCode, demoRes.body).toBe(200);
    const demoIds = (demoRes.json() as { products: Array<{ id: string }> }).products.map(
      (p) => p.id,
    );
    expect(demoIds).not.toContain(productId);
  });

  it('slug inexistente devolve NOT_FOUND', async () => {
    const res = await app.inject({ method: 'GET', url: '/public/nao-existe-de-verdade/catalog' });
    expect(res.statusCode).toBe(404);
  });
});
