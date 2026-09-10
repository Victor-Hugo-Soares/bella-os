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
 * Mesas, QR e sessão de mesa (M6, ACTIVE_PLAN.md) — crítico (tenant/sessão, regra 2 do
 * CLAUDE.md): 3 frentes. Roda contra Postgres real na CI, API conectada como
 * `bella_app` (mesma justificativa dos módulos anteriores).
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
let demoTenantSlug: string;

const ownerEmail = `mesas-owner-${newId()}@example.com`;
const kitchenEmail = `mesas-kitchen-${newId()}@example.com`;
const password = 'senha-forte-mesas-000';

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

function extractGuestToken(res: { headers: Record<string, unknown> }): string {
  const setCookie = res.headers['set-cookie'];
  const raw = Array.isArray(setCookie) ? setCookie : setCookie ? [String(setCookie)] : [];
  const match = raw.map((c) => String(c)).find((c) => c.startsWith(`${GUEST_SESSION_COOKIE}=`));
  if (!match) throw new Error('cookie de sessão de mesa ausente na resposta');
  return decodeURIComponent(match.split(';')[0]!.split('=')[1]!);
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
  demoTenantSlug = demoSpec.slug;
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
  const kitchenRoleId = bellaRoles.find((r) => r.name === 'kitchen')!.id;

  const ownerSignUp = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    payload: { name: 'Dono Mesas', email: ownerEmail, password },
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

  const kitchenSignUp = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    payload: { name: 'Cozinha Mesas', email: kitchenEmail, password },
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

describe('admin — áreas e mesas', () => {
  it('owner cria área e mesa; mesa recebe qr_code único', async () => {
    const cookie = await login(ownerEmail);
    const headers = { cookie, 'x-tenant-id': bellaTenantId };

    const areaRes = await app.inject({
      method: 'POST',
      url: '/v1/areas',
      headers,
      payload: { name: 'Salão ' + newId().slice(0, 6) },
    });
    expect(areaRes.statusCode, areaRes.body).toBe(200);
    const areaId = (areaRes.json() as { area: { id: string } }).area.id;

    const tableRes = await app.inject({
      method: 'POST',
      url: '/v1/tables',
      headers,
      payload: { areaId, label: 'Mesa ' + newId().slice(0, 6), seats: 4 },
    });
    expect(tableRes.statusCode, tableRes.body).toBe(200);
    const table = (tableRes.json() as { table: { id: string; qrCode: string } }).table;
    expect(table.qrCode.length).toBeGreaterThan(4);
  });

  it('negativo: kitchen não tem tables.manage', async () => {
    const cookie = await login(kitchenEmail);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/tables',
      headers: { cookie, 'x-tenant-id': bellaTenantId },
      payload: { label: 'Mesa Negada' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('isolamento: mesa do Bella não aparece na listagem do Demo', async () => {
    const ownerCookie = await login(ownerEmail);
    const tableRes = await app.inject({
      method: 'POST',
      url: '/v1/tables',
      headers: { cookie: ownerCookie, 'x-tenant-id': bellaTenantId },
      payload: { label: 'Mesa Isolamento ' + newId().slice(0, 6) },
    });
    const tableId = (tableRes.json() as { table: { id: string } }).table.id;

    const demoOwnerEmail = `mesas-demo-${newId()}@example.com`;
    const demoRoles = await withTenant(ownerDb.db, demoTenantId, (tx) =>
      tx.select().from(schema.roles).where(eq(schema.roles.tenantId, demoTenantId)),
    );
    const demoOwnerRoleId = demoRoles.find((r) => r.name === 'owner')!.id;
    const demoSignUp = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: { name: 'Dono Demo Mesas', email: demoOwnerEmail, password },
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
      url: '/v1/tables',
      headers: { cookie: demoCookie, 'x-tenant-id': demoTenantId },
    });
    const demoIds = (demoListRes.json() as { tables: Array<{ id: string }> }).tables.map(
      (t) => t.id,
    );
    expect(demoIds).not.toContain(tableId);
  });
});

describe('sessão de mesa (rota pública)', () => {
  it('abre sessão de verdade a partir do código da mesa; devolve cookie httpOnly', async () => {
    const ownerCookie = await login(ownerEmail);
    const tableRes = await app.inject({
      method: 'POST',
      url: '/v1/tables',
      headers: { cookie: ownerCookie, 'x-tenant-id': bellaTenantId },
      payload: { label: 'Mesa Sessão ' + newId().slice(0, 6) },
    });
    const table = (tableRes.json() as { table: { qrCode: string } }).table;

    const openRes = await app.inject({
      method: 'POST',
      url: `/public/${bellaTenantSlug}/tables/${table.qrCode}/session`,
    });
    expect(openRes.statusCode, openRes.body).toBe(200);
    const setCookie = String(openRes.headers['set-cookie']);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    const guestToken = extractGuestToken(openRes);

    const meRes = await app.inject({
      method: 'GET',
      url: '/public/me/table-session',
      headers: { cookie: `${GUEST_SESSION_COOKIE}=${guestToken}` },
    });
    expect(meRes.statusCode, meRes.body).toBe(200);
    const body = openRes.json() as { tableSessionId: string };
    expect((meRes.json() as { tableSessionId: string }).tableSessionId).toBe(body.tableSessionId);
  });

  it('código inexistente devolve NOT_FOUND, não vaza se o tenant existe', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/public/${bellaTenantSlug}/tables/codigo-que-nao-existe/session`,
    });
    expect(res.statusCode).toBe(404);
  });

  it('mesa de um tenant não abre sessão sob o slug de outro tenant', async () => {
    const ownerCookie = await login(ownerEmail);
    const tableRes = await app.inject({
      method: 'POST',
      url: '/v1/tables',
      headers: { cookie: ownerCookie, 'x-tenant-id': bellaTenantId },
      payload: { label: 'Mesa Cross-Tenant ' + newId().slice(0, 6) },
    });
    const table = (tableRes.json() as { table: { qrCode: string } }).table;

    const res = await app.inject({
      method: 'POST',
      url: `/public/${demoTenantSlug}/tables/${table.qrCode}/session`,
    });
    expect(res.statusCode).toBe(404);
  });

  it('concorrência real: duas aberturas simultâneas na mesma mesa nunca criam duas sessões', async () => {
    const ownerCookie = await login(ownerEmail);
    const tableRes = await app.inject({
      method: 'POST',
      url: '/v1/tables',
      headers: { cookie: ownerCookie, 'x-tenant-id': bellaTenantId },
      payload: { label: 'Mesa Concorrência ' + newId().slice(0, 6) },
    });
    const table = (tableRes.json() as { table: { id: string; qrCode: string } }).table;

    const [first, second] = await Promise.all([
      app.inject({
        method: 'POST',
        url: `/public/${bellaTenantSlug}/tables/${table.qrCode}/session`,
      }),
      app.inject({
        method: 'POST',
        url: `/public/${bellaTenantSlug}/tables/${table.qrCode}/session`,
      }),
    ]);
    expect(first.statusCode, first.body).toBe(200);
    expect(second.statusCode, second.body).toBe(200);

    const firstBody = first.json() as { tableSessionId: string };
    const secondBody = second.json() as { tableSessionId: string };
    expect(firstBody.tableSessionId).toBe(secondBody.tableSessionId);

    // consulta independente: só existe UMA sessão não fechada para a mesa no banco.
    const openSessions = await withTenant(ownerDb.db, bellaTenantId, (tx) =>
      tx
        .select({ id: schema.tableSessions.id })
        .from(schema.tableSessions)
        .where(eq(schema.tableSessions.tableId, table.id)),
    );
    expect(openSessions).toHaveLength(1);

    // cada requisição gera um guest DIFERENTE, mas ambos pertencem à mesma sessão.
    const firstToken = extractGuestToken(first);
    const secondToken = extractGuestToken(second);
    expect(firstToken).not.toBe(secondToken);
  });
});
