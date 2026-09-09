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
 * Catálogo (M5, ACTIVE_PLAN.md): CRUD real via API conectada como `bella_app` (mesma
 * justificativa dos módulos anteriores — testar como dono esconderia bug de isolamento).
 * Cobre permissão positiva/negativa, isolamento entre tenants, soft-delete e o vínculo
 * produto↔grupo de modificador. `GET /v1/me/tenants` (ADR-030) também coberto aqui, já
 * que o front do M5 depende dele para descobrir o tenant ativo.
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
let demoTenantId: string;

const ownerEmail = `owner-${newId()}@example.com`;
const kitchenEmail = `kitchen-${newId()}@example.com`;
const password = 'senha-forte-catalogo-000';

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

  // Dono do Bella: papel "owner" já tem catalog.manage (DEFAULT_ROLE_PERMISSIONS).
  const bellaRoles = await withTenant(ownerDb.db, bellaTenantId, (tx) =>
    tx.select().from(schema.roles).where(eq(schema.roles.tenantId, bellaTenantId)),
  );
  const bellaOwnerRoleId = bellaRoles.find((r) => r.name === 'owner')!.id;
  const kitchenRoleId = bellaRoles.find((r) => r.name === 'kitchen')!.id;

  const ownerSignUp = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    payload: { name: 'Dono Catálogo', email: ownerEmail, password },
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

  // "kitchen" não tem catalog.manage (DEFAULT_ROLE_PERMISSIONS: só kitchen.operate).
  const kitchenSignUp = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    payload: { name: 'Cozinha Teste', email: kitchenEmail, password },
  });
  const kitchenUserId = (kitchenSignUp.json() as { user: { id: string } }).user.id;
  await withTenant(ownerDb.db, bellaTenantId, (tx) =>
    tx.insert(schema.memberships).values({
      id: newId(),
      userId: kitchenUserId,
      tenantId: bellaTenantId,
      roleId: kitchenRoleId,
    }),
  );
});

afterAll(async () => {
  await app.close();
  await appDb.close();
  await ownerDb.close();
});

describe('catálogo — estações, categorias, produtos', () => {
  it('owner cria estação, categoria e produto vinculado (fluxo feliz)', async () => {
    const cookie = await login(ownerEmail);
    const headers = { cookie, 'x-tenant-id': bellaTenantId };

    const stationRes = await app.inject({
      method: 'POST',
      url: '/v1/catalog/stations',
      headers,
      payload: { name: 'Cozinha Quente', kind: 'kitchen' },
    });
    expect(stationRes.statusCode, stationRes.body).toBe(200);
    const stationId = (stationRes.json() as { station: { id: string } }).station.id;

    const categoryRes = await app.inject({
      method: 'POST',
      url: '/v1/catalog/categories',
      headers,
      payload: { name: 'Pratos Quentes' },
    });
    expect(categoryRes.statusCode, categoryRes.body).toBe(200);
    const categoryId = (categoryRes.json() as { category: { id: string } }).category.id;

    const productRes = await app.inject({
      method: 'POST',
      url: '/v1/catalog/products',
      headers,
      payload: {
        categoryId,
        stationId,
        name: 'Filé à Parmegiana',
        basePriceCents: 5490,
      },
    });
    expect(productRes.statusCode, productRes.body).toBe(200);
    const product = (productRes.json() as { product: { id: string; isAvailable: boolean } })
      .product;
    expect(product.isAvailable).toBe(true);

    const listRes = await app.inject({
      method: 'GET',
      url: '/v1/catalog/products',
      headers,
    });
    const products = (listRes.json() as { products: Array<{ id: string }> }).products;
    expect(products.some((p) => p.id === product.id)).toBe(true);
  });

  it('produto rejeita categoria/estação de outro tenant (validação cruzada)', async () => {
    const ownerCookie = await login(ownerEmail);
    const bellaHeaders = { cookie: ownerCookie, 'x-tenant-id': bellaTenantId };

    // categoria e estação do Bella
    const stationRes = await app.inject({
      method: 'POST',
      url: '/v1/catalog/stations',
      headers: bellaHeaders,
      payload: { name: 'Bar' + newId().slice(0, 4), kind: 'bar' },
    });
    const stationId = (stationRes.json() as { station: { id: string } }).station.id;

    // categoria do Demo (outro tenant) — precisa de um dono do Demo
    const demoOwnerEmail = `demo-owner-${newId()}@example.com`;
    const demoRoles = await withTenant(ownerDb.db, demoTenantId, (tx) =>
      tx.select().from(schema.roles).where(eq(schema.roles.tenantId, demoTenantId)),
    );
    const demoOwnerRoleId = demoRoles.find((r) => r.name === 'owner')!.id;
    const demoSignUp = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: { name: 'Dono Demo Catálogo', email: demoOwnerEmail, password },
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
    const demoCategoryRes = await app.inject({
      method: 'POST',
      url: '/v1/catalog/categories',
      headers: { cookie: demoCookie, 'x-tenant-id': demoTenantId },
      payload: { name: 'Categoria Demo' },
    });
    const demoCategoryId = (demoCategoryRes.json() as { category: { id: string } }).category.id;

    const res = await app.inject({
      method: 'POST',
      url: '/v1/catalog/products',
      headers: bellaHeaders,
      payload: {
        categoryId: demoCategoryId,
        stationId,
        name: 'Produto Inválido',
        basePriceCents: 1000,
      },
    });
    expect(res.statusCode, res.body).toBe(400);
  });

  it('toggle de disponibilidade funciona e soft-delete não remove a linha', async () => {
    const cookie = await login(ownerEmail);
    const headers = { cookie, 'x-tenant-id': bellaTenantId };

    const stationRes = await app.inject({
      method: 'POST',
      url: '/v1/catalog/stations',
      headers,
      payload: { name: 'Estação Toggle ' + newId().slice(0, 6) },
    });
    const stationId = (stationRes.json() as { station: { id: string } }).station.id;
    const categoryRes = await app.inject({
      method: 'POST',
      url: '/v1/catalog/categories',
      headers,
      payload: { name: 'Categoria Toggle ' + newId().slice(0, 6) },
    });
    const categoryId = (categoryRes.json() as { category: { id: string } }).category.id;
    const productRes = await app.inject({
      method: 'POST',
      url: '/v1/catalog/products',
      headers,
      payload: { categoryId, stationId, name: 'Produto Esgotável', basePriceCents: 2000 },
    });
    const productId = (productRes.json() as { product: { id: string } }).product.id;

    const unavailableRes = await app.inject({
      method: 'PATCH',
      url: `/v1/catalog/products/${productId}/availability`,
      headers,
      payload: { isAvailable: false },
    });
    expect(unavailableRes.statusCode, unavailableRes.body).toBe(200);
    expect(
      (unavailableRes.json() as { product: { isAvailable: boolean } }).product.isAvailable,
    ).toBe(false);

    const deactivateRes = await app.inject({
      method: 'PATCH',
      url: `/v1/catalog/products/${productId}`,
      headers,
      payload: { isActive: false },
    });
    expect(deactivateRes.statusCode, deactivateRes.body).toBe(200);

    // some da listagem padrão...
    const defaultList = await app.inject({ method: 'GET', url: '/v1/catalog/products', headers });
    const defaultIds = (defaultList.json() as { products: Array<{ id: string }> }).products.map(
      (p) => p.id,
    );
    expect(defaultIds).not.toContain(productId);

    // ...mas continua no banco (soft-delete, não DELETE físico).
    const includeInactiveList = await app.inject({
      method: 'GET',
      url: '/v1/catalog/products?includeInactive=true',
      headers,
    });
    const allIds = (includeInactiveList.json() as { products: Array<{ id: string }> }).products.map(
      (p) => p.id,
    );
    expect(allIds).toContain(productId);
  });

  it('negativo: kitchen não tem catalog.manage', async () => {
    const cookie = await login(kitchenEmail);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/catalog/stations',
      headers: { cookie, 'x-tenant-id': bellaTenantId },
      payload: { name: 'Estação Negada' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('isolamento: produto do Bella não aparece na listagem do Demo', async () => {
    const bellaCookie = await login(ownerEmail);
    const stationRes = await app.inject({
      method: 'POST',
      url: '/v1/catalog/stations',
      headers: { cookie: bellaCookie, 'x-tenant-id': bellaTenantId },
      payload: { name: 'Estação Isolamento ' + newId().slice(0, 6) },
    });
    const stationId = (stationRes.json() as { station: { id: string } }).station.id;
    const categoryRes = await app.inject({
      method: 'POST',
      url: '/v1/catalog/categories',
      headers: { cookie: bellaCookie, 'x-tenant-id': bellaTenantId },
      payload: { name: 'Categoria Isolamento ' + newId().slice(0, 6) },
    });
    const categoryId = (categoryRes.json() as { category: { id: string } }).category.id;
    const productRes = await app.inject({
      method: 'POST',
      url: '/v1/catalog/products',
      headers: { cookie: bellaCookie, 'x-tenant-id': bellaTenantId },
      payload: { categoryId, stationId, name: 'Produto Só do Bella', basePriceCents: 3000 },
    });
    const productId = (productRes.json() as { product: { id: string } }).product.id;

    const demoOwnerEmail2 = `demo-owner2-${newId()}@example.com`;
    const demoRoles = await withTenant(ownerDb.db, demoTenantId, (tx) =>
      tx.select().from(schema.roles).where(eq(schema.roles.tenantId, demoTenantId)),
    );
    const demoOwnerRoleId = demoRoles.find((r) => r.name === 'owner')!.id;
    const demoSignUp = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: { name: 'Dono Demo Isolamento', email: demoOwnerEmail2, password },
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
    const demoCookie = await login(demoOwnerEmail2);
    const demoListRes = await app.inject({
      method: 'GET',
      url: '/v1/catalog/products',
      headers: { cookie: demoCookie, 'x-tenant-id': demoTenantId },
    });
    const demoIds = (demoListRes.json() as { products: Array<{ id: string }> }).products.map(
      (p) => p.id,
    );
    expect(demoIds).not.toContain(productId);
  });
});

describe('grupos de modificador e vínculo com produto (API sem UI no M5)', () => {
  it('cria grupo, modificador, vincula ao produto e desvincula', async () => {
    const cookie = await login(ownerEmail);
    const headers = { cookie, 'x-tenant-id': bellaTenantId };

    const groupRes = await app.inject({
      method: 'POST',
      url: '/v1/catalog/modifier-groups',
      headers,
      payload: { name: 'Ponto da Carne ' + newId().slice(0, 6), minSelect: 1, maxSelect: 1 },
    });
    expect(groupRes.statusCode, groupRes.body).toBe(200);
    const groupId = (groupRes.json() as { modifierGroup: { id: string } }).modifierGroup.id;

    const modifierRes = await app.inject({
      method: 'POST',
      url: '/v1/catalog/modifiers',
      headers,
      payload: { groupId, name: 'Ao ponto', priceCents: 0 },
    });
    expect(modifierRes.statusCode, modifierRes.body).toBe(200);

    const stationRes = await app.inject({
      method: 'POST',
      url: '/v1/catalog/stations',
      headers,
      payload: { name: 'Estação Modificador ' + newId().slice(0, 6) },
    });
    const stationId = (stationRes.json() as { station: { id: string } }).station.id;
    const categoryRes = await app.inject({
      method: 'POST',
      url: '/v1/catalog/categories',
      headers,
      payload: { name: 'Categoria Modificador ' + newId().slice(0, 6) },
    });
    const categoryId = (categoryRes.json() as { category: { id: string } }).category.id;
    const productRes = await app.inject({
      method: 'POST',
      url: '/v1/catalog/products',
      headers,
      payload: { categoryId, stationId, name: 'Picanha', basePriceCents: 8900 },
    });
    const productId = (productRes.json() as { product: { id: string } }).product.id;

    const linkRes = await app.inject({
      method: 'POST',
      url: `/v1/catalog/products/${productId}/modifier-groups`,
      headers,
      payload: { groupId },
    });
    expect(linkRes.statusCode, linkRes.body).toBe(200);

    const unlinkRes = await app.inject({
      method: 'DELETE',
      url: `/v1/catalog/products/${productId}/modifier-groups/${groupId}`,
      headers,
    });
    expect(unlinkRes.statusCode, unlinkRes.body).toBe(200);
  });
});

describe('GET /v1/me/tenants (ADR-030)', () => {
  it('devolve o tenant onde o usuário tem membership ativa, sem X-Tenant-Id', async () => {
    const cookie = await login(ownerEmail);
    const res = await app.inject({ method: 'GET', url: '/v1/me/tenants', headers: { cookie } });
    expect(res.statusCode, res.body).toBe(200);
    const tenants = (res.json() as { tenants: Array<{ id: string; slug: string }> }).tenants;
    expect(tenants.some((t) => t.id === bellaTenantId)).toBe(true);
    expect(tenants.every((t) => t.id !== demoTenantId)).toBe(true);
  });

  it('sem sessão: UNAUTHENTICATED', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/me/tenants' });
    expect(res.statusCode).toBe(401);
  });
});
