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
 * Golden Journey (M15, ACTIVE_PLAN.md, `TESTING_STRATEGY.md`) — o ciclo inteiro numa
 * única comanda, provando que os 15 milestones compõem um sistema de verdade, não só
 * módulos isolados que passam nos próprios testes: cliente escaneia QR → pede → cozinha
 * prepara (KDS real) → cliente acompanha e pede a conta → equipe consulta o total e
 * aplica desconto → cliente é cobrado → comanda fecha → caixa fecha o turno sem
 * divergência. Roda contra Postgres real na CI, API conectada como `bella_app`.
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

const ownerEmail = `m15-golden-owner-${newId()}@example.com`;
const password = 'senha-forte-m15-golden-000';

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

  const signUp = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    payload: { name: 'Dono M15 Golden', email: ownerEmail, password },
  });
  const userId = (signUp.json() as { user: { id: string } }).user.id;
  await withTenant(ownerDb.db, bellaTenantId, (tx) =>
    tx
      .insert(schema.memberships)
      .values({ id: newId(), userId, tenantId: bellaTenantId, roleId: ownerRoleId }),
  );

  // Defesa contra estado residual de outros arquivos (mesmo princípio do M14/M15).
  await withTenant(ownerDb.db, bellaTenantId, (tx) =>
    tx
      .update(schema.cashSessions)
      .set({ status: 'closed', closedAt: new Date() })
      .where(
        and(
          eq(schema.cashSessions.tenantId, bellaTenantId),
          eq(schema.cashSessions.status, 'open'),
        ),
      ),
  );
});

afterAll(async () => {
  await app.close();
  await appDb.close();
  await ownerDb.close();
});

describe('Golden Journey — cliente→cozinha→salão→caixa→fechamento numa mesma comanda', () => {
  it('percorre o ciclo inteiro sem pedido perdido, duplicado ou conta errada', async () => {
    const ownerCookie = await login(ownerEmail);
    const headers = { cookie: ownerCookie, 'x-tenant-id': bellaTenantId };
    const suffix = newId().slice(-8);

    // 1. Cardápio: estação + produto (preço redondo pra facilitar a conferência).
    const stationRes = await app.inject({
      method: 'POST',
      url: '/v1/catalog/stations',
      headers,
      payload: { name: `Cozinha Golden ${suffix}` },
    });
    const stationId = (stationRes.json() as { station: { id: string } }).station.id;
    const categoryRes = await app.inject({
      method: 'POST',
      url: '/v1/catalog/categories',
      headers,
      payload: { name: `Pratos Golden ${suffix}` },
    });
    const categoryId = (categoryRes.json() as { category: { id: string } }).category.id;
    const productRes = await app.inject({
      method: 'POST',
      url: '/v1/catalog/products',
      headers,
      payload: {
        categoryId,
        stationId,
        name: `Prato Golden ${suffix}`,
        basePriceCents: 9_000,
      },
    });
    const productId = (productRes.json() as { product: { id: string } }).product.id;

    const tableRes = await app.inject({
      method: 'POST',
      url: '/v1/tables',
      headers,
      payload: { label: `Mesa Golden ${suffix}` },
    });
    const table = (tableRes.json() as { table: { qrCode: string } }).table;

    // 2. Cliente escaneia o QR e abre a sessão de mesa.
    const openSessionRes = await app.inject({
      method: 'POST',
      url: `/public/${bellaTenantSlug}/tables/${table.qrCode}/session`,
    });
    expect(openSessionRes.statusCode, openSessionRes.body).toBe(200);
    const setCookie = openSessionRes.headers['set-cookie'];
    const raw = Array.isArray(setCookie) ? setCookie : setCookie ? [String(setCookie)] : [];
    const guestCookieHeader = raw
      .map((c) => String(c))
      .find((c) => c.startsWith(`${GUEST_SESSION_COOKIE}=`));
    if (!guestCookieHeader) throw new Error('cookie de sessão de mesa ausente');
    const guestCookie = guestCookieHeader.split(';')[0]!;

    // 3. Cliente monta o pedido e envia — idempotência garante UM pedido só.
    const idempotencyKey = newId();
    const orderPayload = { items: [{ productId, quantity: 2 }] }; // 2x9000 = 18000
    const [orderRes, duplicateRes] = await Promise.all([
      app.inject({
        method: 'POST',
        url: `/public/${bellaTenantSlug}/orders`,
        headers: { cookie: guestCookie, 'idempotency-key': idempotencyKey },
        payload: orderPayload,
      }),
      app.inject({
        method: 'POST',
        url: `/public/${bellaTenantSlug}/orders`,
        headers: { cookie: guestCookie, 'idempotency-key': idempotencyKey },
        payload: orderPayload,
      }),
    ]);
    expect(orderRes.statusCode, orderRes.body).toBe(201);
    expect(duplicateRes.statusCode, duplicateRes.body).toBe(201);
    const orderBody = orderRes.json() as {
      order: { id: string };
      items: Array<{ id: string }>;
    };
    expect((duplicateRes.json() as { order: { id: string } }).order.id).toBe(orderBody.order.id);

    const orderRow = (
      await withTenant(ownerDb.db, bellaTenantId, (tx) =>
        tx.select().from(schema.orders).where(eq(schema.orders.id, orderBody.order.id)),
      )
    )[0]!;
    const tabId = orderRow.tabId;

    // Nenhum pedido duplicado de verdade: só um order_item por linha pedida.
    const itemRows = await withTenant(ownerDb.db, bellaTenantId, (tx) =>
      tx.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, orderBody.order.id)),
    );
    expect(itemRows).toHaveLength(1);

    // 4. Cozinha: pareia um KDS na estação, inicia e finaliza o preparo (ticket real).
    const ticketRow = (
      await withTenant(ownerDb.db, bellaTenantId, (tx) =>
        tx
          .select()
          .from(schema.productionTickets)
          .where(eq(schema.productionTickets.orderId, orderBody.order.id)),
      )
    )[0]!;
    const pairRes = await app.inject({
      method: 'POST',
      url: '/v1/devices/pairing-codes',
      headers,
      payload: {
        deviceKind: 'kds',
        deviceName: `KDS Golden ${suffix}`,
        stationIds: [stationId],
      },
    });
    const { code } = pairRes.json() as { code: string };
    const exchangeRes = await app.inject({
      method: 'POST',
      url: '/v1/devices/exchange',
      payload: { code },
    });
    const { token: deviceToken } = exchangeRes.json() as { token: string };

    const startRes = await app.inject({
      method: 'POST',
      url: `/v1/kds/tickets/${ticketRow.id}/start`,
      headers: { 'x-device-token': deviceToken },
    });
    expect(startRes.statusCode, startRes.body).toBe(200);
    const readyRes = await app.inject({
      method: 'POST',
      url: `/v1/kds/tickets/${ticketRow.id}/ready`,
      headers: { 'x-device-token': deviceToken },
    });
    expect(readyRes.statusCode, readyRes.body).toBe(200);

    // 5. Cliente acompanha (item pronto) e pede a conta.
    const trackRes = await app.inject({
      method: 'GET',
      url: `/public/${bellaTenantSlug}/orders`,
      headers: { cookie: guestCookie },
    });
    const tracked = (trackRes.json() as { orders: Array<{ items: Array<{ status: string }> }> })
      .orders[0]!;
    expect(tracked.items[0]!.status).toBe('ready');

    const billRequestRes = await app.inject({
      method: 'POST',
      url: `/public/${bellaTenantSlug}/service-requests`,
      headers: { cookie: guestCookie },
      payload: { kind: 'request_bill' },
    });
    expect(billRequestRes.statusCode, billRequestRes.body).toBe(200);

    // 6. Equipe vê o chamado, consulta o total (trava a taxa de serviço) e dá um desconto.
    const openCallsRes = await app.inject({
      method: 'GET',
      url: '/v1/service-requests',
      headers,
    });
    const openCalls = (openCallsRes.json() as { serviceRequests: Array<{ kind: string }> })
      .serviceRequests;
    expect(openCalls.some((c) => c.kind === 'request_bill')).toBe(true);

    const firstBillRes = await app.inject({
      method: 'GET',
      url: `/v1/tabs/${tabId}/bill`,
      headers,
    });
    const firstBill = (firstBillRes.json() as { bill: { grandTotalCents: number } }).bill;
    expect(firstBill.grandTotalCents).toBe(19_800); // 18000 + 10% service_fee

    const discountRes = await app.inject({
      method: 'POST',
      url: `/v1/tabs/${tabId}/discounts`,
      headers,
      payload: { kind: 'fixed', amountCents: 800, reason: 'Cortesia da casa' },
    });
    expect(discountRes.statusCode, discountRes.body).toBe(201);

    const billAfterDiscountRes = await app.inject({
      method: 'GET',
      url: `/v1/tabs/${tabId}/bill`,
      headers,
    });
    const billAfterDiscount = (
      billAfterDiscountRes.json() as { bill: { grandTotalCents: number; balanceCents: number } }
    ).bill;
    // service_fee já estava travado (10% de 18000 = 1800); desconto não recalcula a
    // taxa retroativamente (mesmo comportamento documentado desde o M12).
    expect(billAfterDiscount.grandTotalCents).toBe(19_000); // 18000 - 800 + 1800
    expect(billAfterDiscount.balanceCents).toBe(19_000);

    // 7. Caixa: abre sessão, cobra o valor exato, fecha a comanda.
    const openCashRes = await app.inject({
      method: 'POST',
      url: '/v1/cash-sessions/open',
      headers,
      payload: { openingFloatCents: 0 },
    });
    expect(openCashRes.statusCode, openCashRes.body).toBe(201);
    const cashSessionId = (openCashRes.json() as { session: { id: string } }).session.id;

    const payRes = await app.inject({
      method: 'POST',
      url: `/v1/tabs/${tabId}/payments`,
      headers: { ...headers, 'idempotency-key': newId() },
      payload: { method: 'pix', amountCents: 19_000 },
    });
    expect(payRes.statusCode, payRes.body).toBe(201);

    const closeTabRes = await app.inject({
      method: 'POST',
      url: `/v1/tabs/${tabId}/close`,
      headers,
    });
    expect(closeTabRes.statusCode, closeTabRes.body).toBe(200);
    expect((closeTabRes.json() as { closure: { status: string } }).closure.status).toBe('closed');

    // Comanda fechada nunca mais aceita pedido novo — anti-QR-remoto depois do fechamento.
    const orderAfterCloseRes = await app.inject({
      method: 'POST',
      url: `/public/${bellaTenantSlug}/orders`,
      headers: { cookie: guestCookie, 'idempotency-key': newId() },
      payload: { items: [{ productId, quantity: 1 }] },
    });
    expect(orderAfterCloseRes.statusCode).toBeGreaterThanOrEqual(400);

    // 8. Caixa fecha o turno: contado bate o esperado, sem divergência.
    const closeCashRes = await app.inject({
      method: 'POST',
      url: `/v1/cash-sessions/${cashSessionId}/close`,
      headers,
      payload: { counted: [{ method: 'pix', amountCents: 19_000 }] },
    });
    expect(closeCashRes.statusCode, closeCashRes.body).toBe(200);
    const cashSummary = (
      closeCashRes.json() as {
        summary: { byMethod: Array<{ method: string; differenceCents: number }> };
      }
    ).summary;
    const pix = cashSummary.byMethod.find((m) => m.method === 'pix')!;
    expect(pix.differenceCents).toBe(0);

    // Consulta independente ao banco: o ledger inteiro soma exatamente 0 (tudo pago).
    const ledgerRows = await withTenant(ownerDb.db, bellaTenantId, (tx) =>
      tx.select().from(schema.ledgerEntries).where(eq(schema.ledgerEntries.tabId, tabId)),
    );
    const ledgerSum = ledgerRows.reduce((sum, r) => sum + r.amountCents, 0);
    // item_charge(18000) + service_fee(1800) - discount(800) - payment(19000) = 0.
    expect(ledgerSum).toBe(0);
  });
});
