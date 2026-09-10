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
 * Relatório do dia operacional (M16, ACTIVE_PLAN.md) — leitura, normal (não crítico:
 * regra 2 do CLAUDE.md exige 3 frentes só para dinheiro/comanda/etc. MUTANDO; aqui é só
 * consulta). 2 frentes. Roda contra Postgres real na CI, API conectada como `bella_app`.
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

const ownerEmail = `m16-owner-${newId()}@example.com`;
const kitchenEmail = `m16-kitchen-${newId()}@example.com`;
const password = 'senha-forte-m16-000';

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
  itemIds: string[];
  orderId: string;
}

/** Comanda com 2 itens (preços redondos e diferentes) num mesmo pedido de cliente. */
async function createTabWithTwoItems(): Promise<Setup> {
  const ownerCookie = await login(ownerEmail);
  const suffix = newId().slice(-8);
  const headers = { cookie: ownerCookie, 'x-tenant-id': bellaTenantId };

  const stationRes = await app.inject({
    method: 'POST',
    url: '/v1/catalog/stations',
    headers,
    payload: { name: `Estação M16 ${suffix}` },
  });
  const stationId = (stationRes.json() as { station: { id: string } }).station.id;
  const categoryRes = await app.inject({
    method: 'POST',
    url: '/v1/catalog/categories',
    headers,
    payload: { name: `Categoria M16 ${suffix}` },
  });
  const categoryId = (categoryRes.json() as { category: { id: string } }).category.id;
  const productARes = await app.inject({
    method: 'POST',
    url: '/v1/catalog/products',
    headers,
    payload: { categoryId, stationId, name: `Produto A M16 ${suffix}`, basePriceCents: 5_000 },
  });
  const productAId = (productARes.json() as { product: { id: string } }).product.id;
  const productBRes = await app.inject({
    method: 'POST',
    url: '/v1/catalog/products',
    headers,
    payload: { categoryId, stationId, name: `Produto B M16 ${suffix}`, basePriceCents: 3_000 },
  });
  const productBId = (productBRes.json() as { product: { id: string } }).product.id;

  const tableRes = await app.inject({
    method: 'POST',
    url: '/v1/tables',
    headers,
    payload: { label: `Mesa M16 ${suffix}` },
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
    payload: {
      items: [
        { productId: productAId, quantity: 1 },
        { productId: productBId, quantity: 1 },
      ],
    },
  });
  const orderBody = orderRes.json() as { order: { id: string }; items: Array<{ id: string }> };
  const orderRow = await withTenant(ownerDb.db, bellaTenantId, (tx) =>
    tx.select().from(schema.orders).where(eq(schema.orders.id, orderBody.order.id)),
  );
  return {
    tabId: orderRow[0]!.tabId,
    itemIds: orderBody.items.map((i) => i.id),
    orderId: orderBody.order.id,
  };
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
    [ownerEmail, 'Dono M16', ownerRoleId],
    [kitchenEmail, 'Cozinha M16', kitchenRoleId],
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

describe('GET /v1/reports/daily', () => {
  it('faturamento, ticket médio, mais vendidos e agregações por operador batem com o esperado', async () => {
    // Janela estreita ao redor do próprio teste — a suíte inteira roda em menos de um
    // minuto, então uma janela larga (ex.: "últimos 60s") capturaria pedidos de OUTROS
    // arquivos de teste no mesmo tenant `bella` (achado real, pego pela própria CI).
    const from = new Date().toISOString();
    const setup = await createTabWithTwoItems();
    const ownerCookie = await login(ownerEmail);
    const headers = { cookie: ownerCookie, 'x-tenant-id': bellaTenantId };

    // Item A (5000): cancelado ANTES da produção -> sempre revertido, NÃO conta no faturamento.
    const cancelA = await app.inject({
      method: 'PATCH',
      url: `/v1/orders/${setup.orderId}/items/${setup.itemIds[0]}/cancel`,
      headers,
      payload: { stage: 'before_production', reason: 'Cliente desistiu' },
    });
    expect(cancelA.statusCode, cancelA.body).toBe(200);

    // Desconto fixo de 300 sobre o item B (3000) restante.
    const discountRes = await app.inject({
      method: 'POST',
      url: `/v1/tabs/${setup.tabId}/discounts`,
      headers,
      payload: { kind: 'fixed', amountCents: 300, reason: 'Cortesia' },
    });
    expect(discountRes.statusCode, discountRes.body).toBe(201);

    const to = new Date().toISOString();
    const res = await app.inject({
      method: 'GET',
      url: `/v1/reports/daily?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      headers,
    });
    expect(res.statusCode, res.body).toBe(200);
    const report = (
      res.json() as {
        report: {
          faturamentoCents: number;
          tabsServedCount: number;
          ticketMedioCents: number;
          topProducts: Array<{ name: string; revenueCents: number; quantity: number }>;
          cancellationsByOperator: Array<{ userId: string; count: number; amountCents: number }>;
          discountsByOperator: Array<{ userId: string; count: number; amountCents: number }>;
        };
      }
    ).report;

    // Só o produto B (3000) conta -- o A foi revertido.
    expect(report.faturamentoCents).toBe(3_000);
    expect(report.tabsServedCount).toBe(1);
    expect(report.ticketMedioCents).toBe(3_000);
    const productB = report.topProducts.find((p) => p.revenueCents === 3_000);
    expect(productB).toBeDefined();
    expect(productB!.quantity).toBe(1);
    expect(report.topProducts.some((p) => p.revenueCents === 5_000)).toBe(false);

    const ownerCancellation = report.cancellationsByOperator[0]!;
    expect(ownerCancellation.count).toBeGreaterThanOrEqual(1);
    expect(ownerCancellation.amountCents).toBeGreaterThanOrEqual(5_000);

    const ownerDiscount = report.discountsByOperator[0]!;
    expect(ownerDiscount.count).toBeGreaterThanOrEqual(1);
    expect(ownerDiscount.amountCents).toBeGreaterThanOrEqual(300);
  });

  it('fora do intervalo não aparece; sem reports.view -> 403', async () => {
    // Gera atividade "agora" só para garantir que existe algo fora do intervalo consultado.
    await createTabWithTwoItems();
    const ownerCookie = await login(ownerEmail);
    const headers = { cookie: ownerCookie, 'x-tenant-id': bellaTenantId };

    // Intervalo no passado distante -- não deve conter o pedido recém-criado.
    const pastFrom = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const pastTo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const pastRes = await app.inject({
      method: 'GET',
      url: `/v1/reports/daily?from=${encodeURIComponent(pastFrom)}&to=${encodeURIComponent(pastTo)}`,
      headers,
    });
    expect(pastRes.statusCode, pastRes.body).toBe(200);
    const pastReport = (pastRes.json() as { report: { faturamentoCents: number } }).report;
    expect(pastReport.faturamentoCents).toBe(0);

    const kitchenCookie = await login(kitchenEmail);
    const deniedRes = await app.inject({
      method: 'GET',
      url: `/v1/reports/daily?from=${encodeURIComponent(pastFrom)}&to=${encodeURIComponent(pastTo)}`,
      headers: { cookie: kitchenCookie, 'x-tenant-id': bellaTenantId },
    });
    expect(deniedRes.statusCode).toBe(403);
  });
});
