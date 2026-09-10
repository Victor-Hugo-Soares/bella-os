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
 * Criação de pedido (M8, ACTIVE_PLAN.md) — **CRÍTICO** (dinheiro/comanda, regra 2 do
 * CLAUDE.md): 3 frentes. Roda contra Postgres real na CI, API conectada como
 * `bella_app`.
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

const ownerEmail = `orders-owner-${newId()}@example.com`;
const password = 'senha-forte-orders-000';

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
  stationId: string;
  categoryId: string;
  productId: string;
  productPriceCents: number;
}

async function setupCatalog(cookie: string): Promise<Setup> {
  const suffix = newId().slice(0, 8);
  const headers = { cookie, 'x-tenant-id': bellaTenantId };
  const stationRes = await app.inject({
    method: 'POST',
    url: '/v1/catalog/stations',
    headers,
    payload: { name: `Estação Pedido ${suffix}` },
  });
  const stationId = (stationRes.json() as { station: { id: string } }).station.id;
  const categoryRes = await app.inject({
    method: 'POST',
    url: '/v1/catalog/categories',
    headers,
    payload: { name: `Categoria Pedido ${suffix}` },
  });
  const categoryId = (categoryRes.json() as { category: { id: string } }).category.id;
  const productRes = await app.inject({
    method: 'POST',
    url: '/v1/catalog/products',
    headers,
    payload: { categoryId, stationId, name: `Produto Pedido ${suffix}`, basePriceCents: 3300 },
  });
  const productId = (productRes.json() as { product: { id: string } }).product.id;
  return { stationId, categoryId, productId, productPriceCents: 3300 };
}

async function openTableSession(): Promise<{ cookie: string; tableSessionId: string }> {
  const suffix = newId().slice(0, 8);
  const ownerCookie = await login(ownerEmail);
  const tableRes = await app.inject({
    method: 'POST',
    url: '/v1/tables',
    headers: { cookie: ownerCookie, 'x-tenant-id': bellaTenantId },
    payload: { label: `Mesa Pedido ${suffix}` },
  });
  const table = (tableRes.json() as { table: { qrCode: string } }).table;
  const openRes = await app.inject({
    method: 'POST',
    url: `/public/${bellaTenantSlug}/tables/${table.qrCode}/session`,
  });
  const cookie = extractGuestCookie(openRes);
  const body = openRes.json() as { tableSessionId: string };
  return { cookie, tableSessionId: body.tableSessionId };
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
    payload: { name: 'Dono Pedidos', email: ownerEmail, password },
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

describe('criação de pedido (cliente) — fluxo feliz e dinheiro', () => {
  it('cria pedido com preço do servidor, ticket de produção e ledger corretos', async () => {
    const ownerCookie = await login(ownerEmail);
    const setup = await setupCatalog(ownerCookie);
    const { cookie } = await openTableSession();
    const idempotencyKey = newId();

    const res = await app.inject({
      method: 'POST',
      url: `/public/${bellaTenantSlug}/orders`,
      headers: { cookie, 'idempotency-key': idempotencyKey },
      payload: { items: [{ productId: setup.productId, quantity: 2 }] },
    });
    expect(res.statusCode, res.body).toBe(201);
    const body = res.json() as {
      order: { id: string; totalCents: number; status: string };
      items: Array<{ lineTotalCents: number; unitPriceCents: number }>;
    };
    expect(body.items[0]!.unitPriceCents).toBe(setup.productPriceCents);
    expect(body.order.totalCents).toBe(setup.productPriceCents * 2);
    expect(body.order.status).toBe('submitted');

    // consulta independente: ledger bate com o total devolvido pela API.
    const orderRows = await withTenant(ownerDb.db, bellaTenantId, (tx) =>
      tx.select().from(schema.orders).where(eq(schema.orders.id, body.order.id)),
    );
    expect(orderRows).toHaveLength(1);

    const itemRows = await withTenant(ownerDb.db, bellaTenantId, (tx) =>
      tx.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, body.order.id)),
    );
    expect(itemRows).toHaveLength(1);
    const ledgerForItem = await withTenant(ownerDb.db, bellaTenantId, (tx) =>
      tx.select().from(schema.ledgerEntries).where(eq(schema.ledgerEntries.refId, itemRows[0]!.id)),
    );
    expect(ledgerForItem).toHaveLength(1);
    expect(ledgerForItem[0]!.amountCents).toBe(setup.productPriceCents * 2);
    expect(ledgerForItem[0]!.type).toBe('item_charge');

    const ticketRows = await withTenant(ownerDb.db, bellaTenantId, (tx) =>
      tx
        .select()
        .from(schema.productionTickets)
        .where(eq(schema.productionTickets.orderId, body.order.id)),
    );
    expect(ticketRows).toHaveLength(1);
    expect(ticketRows[0]!.stationId).toBe(setup.stationId);
  });

  it('item indisponível: 422, nenhuma linha criada (tudo ou nada)', async () => {
    const ownerCookie = await login(ownerEmail);
    const setup = await setupCatalog(ownerCookie);
    await app.inject({
      method: 'PATCH',
      url: `/v1/catalog/products/${setup.productId}/availability`,
      headers: { cookie: ownerCookie, 'x-tenant-id': bellaTenantId },
      payload: { isAvailable: false },
    });
    const { cookie } = await openTableSession();
    const idempotencyKey = newId();

    const res = await app.inject({
      method: 'POST',
      url: `/public/${bellaTenantSlug}/orders`,
      headers: { cookie, 'idempotency-key': idempotencyKey },
      payload: { items: [{ productId: setup.productId, quantity: 1 }] },
    });
    expect(res.statusCode, res.body).toBe(422);

    // tudo ou nada: nem o pedido nem a chave de idempotência ficam gravados quando a
    // transação falha (a claim de idempotência é desfeita junto pelo rollback).
    const orderRows = await withTenant(ownerDb.db, bellaTenantId, (tx) =>
      tx.select().from(schema.orders).where(eq(schema.orders.idempotencyKey, idempotencyKey)),
    );
    expect(orderRows).toHaveLength(0);
    const idempotencyRows = await withTenant(ownerDb.db, bellaTenantId, (tx) =>
      tx
        .select()
        .from(schema.idempotencyKeys)
        .where(eq(schema.idempotencyKeys.key, idempotencyKey)),
    );
    expect(idempotencyRows).toHaveLength(0);
  });
});

describe('idempotência real (crítico)', () => {
  it('mesma chave + mesmo corpo 2x → 1 pedido só', async () => {
    const ownerCookie = await login(ownerEmail);
    const setup = await setupCatalog(ownerCookie);
    const { cookie } = await openTableSession();
    const idempotencyKey = newId();
    const payload = { items: [{ productId: setup.productId, quantity: 1 }] };

    const first = await app.inject({
      method: 'POST',
      url: `/public/${bellaTenantSlug}/orders`,
      headers: { cookie, 'idempotency-key': idempotencyKey },
      payload,
    });
    const second = await app.inject({
      method: 'POST',
      url: `/public/${bellaTenantSlug}/orders`,
      headers: { cookie, 'idempotency-key': idempotencyKey },
      payload,
    });
    expect(first.statusCode, first.body).toBe(201);
    expect(second.statusCode, second.body).toBe(201);
    const firstBody = first.json() as { order: { id: string } };
    const secondBody = second.json() as { order: { id: string } };
    expect(firstBody.order.id).toBe(secondBody.order.id);

    const orderRows = await withTenant(ownerDb.db, bellaTenantId, (tx) =>
      tx.select().from(schema.orders).where(eq(schema.orders.idempotencyKey, idempotencyKey)),
    );
    expect(orderRows).toHaveLength(1);
  });

  it('mesma chave + corpo diferente → 409 IDEMPOTENCY_MISMATCH', async () => {
    const ownerCookie = await login(ownerEmail);
    const setup = await setupCatalog(ownerCookie);
    const { cookie } = await openTableSession();
    const idempotencyKey = newId();

    const first = await app.inject({
      method: 'POST',
      url: `/public/${bellaTenantSlug}/orders`,
      headers: { cookie, 'idempotency-key': idempotencyKey },
      payload: { items: [{ productId: setup.productId, quantity: 1 }] },
    });
    expect(first.statusCode, first.body).toBe(201);

    const second = await app.inject({
      method: 'POST',
      url: `/public/${bellaTenantSlug}/orders`,
      headers: { cookie, 'idempotency-key': idempotencyKey },
      payload: { items: [{ productId: setup.productId, quantity: 2 }] },
    });
    expect(second.statusCode, second.body).toBe(409);
    expect((second.json() as { error: { code: string } }).error.code).toBe('IDEMPOTENCY_MISMATCH');
  });

  it('concorrência real (Promise.all): duas requisições com a mesma chave nunca criam dois pedidos', async () => {
    const ownerCookie = await login(ownerEmail);
    const setup = await setupCatalog(ownerCookie);
    const { cookie } = await openTableSession();
    const idempotencyKey = newId();
    const payload = { items: [{ productId: setup.productId, quantity: 3 }] };

    const [first, second] = await Promise.all([
      app.inject({
        method: 'POST',
        url: `/public/${bellaTenantSlug}/orders`,
        headers: { cookie, 'idempotency-key': idempotencyKey },
        payload,
      }),
      app.inject({
        method: 'POST',
        url: `/public/${bellaTenantSlug}/orders`,
        headers: { cookie, 'idempotency-key': idempotencyKey },
        payload,
      }),
    ]);

    const statuses = [first.statusCode, second.statusCode].sort();
    // Uma das duas pode legitimamente ver "em andamento" (409) se a outra ainda não
    // tinha terminado o UPDATE final no exato instante da leitura — nunca duas 201
    // com pedidos diferentes. O caso mais comum é 201/201 com o MESMO id.
    expect(statuses.every((s) => s === 201 || s === 409)).toBe(true);

    const orderRows = await withTenant(ownerDb.db, bellaTenantId, (tx) =>
      tx.select().from(schema.orders).where(eq(schema.orders.idempotencyKey, idempotencyKey)),
    );
    expect(orderRows).toHaveLength(1);
  });
});
