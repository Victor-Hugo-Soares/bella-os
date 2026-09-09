import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { eq } from 'drizzle-orm';
import { createDb, schema, withoutTenant, withTenant, type DbHandle } from '@bella/db';
import { runMigrations } from '@bella/db/migrate';
import { seed, SEED_TENANTS } from '@bella/db/seed';
import { setAppRolePassword } from '@bella/db/set-app-role-password';
import { newId } from '@bella/domain';
import { buildApp } from '../../src/app';
import { loadConfig } from '../../src/config';
import { createAuth, type Auth } from '../../src/modules/identity/auth';
import { requirePermission, resolveActor } from '../../src/modules/identity/require-permission';

/**
 * Prova `requirePermission`/`resolveActor` (M2, ACTIVE_PLAN.md critério 3): positivo e
 * negativo para papéis diferentes, e que membership só no tenant Demo não dá acesso ao
 * tenant Bella mesmo autenticado. Sessão de verdade emitida pela API real conectada
 * como `bella_app` (mesma justificativa de `auth.test.ts`: testar com a conexão de
 * dono esconderia um bug de isolamento, já que RLS não se aplica ao dono).
 * `resolveActor`/`requirePermission` chamados diretamente (sem rota HTTP dedicada —
 * nenhum módulo de negócio existe ainda para proteger de verdade), mas sobre a mesma
 * instância de auth/banco que a API real usaria.
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
let auth: Auth;
let bellaTenantId: string;
let demoTenantId: string;

const email = `cashier-${newId()}@example.com`;
const password = 'senha-forte-654321';

function fakeRequest(headers: Record<string, string>): FastifyRequest {
  return { headers } as unknown as FastifyRequest;
}

async function sessionCookie(): Promise<string> {
  const signIn = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    payload: { email, password },
  });
  const setCookie = signIn.headers['set-cookie'];
  const raw = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const cookie = raw
    .map((c) => c.split(';')[0])
    .filter((c): c is string => Boolean(c))
    .join('; ');
  if (!cookie) throw new Error(`sign-in falhou ao obter cookie: ${signIn.body}`);
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

  // `ownerDb` ignora RLS (é o dono do banco) — filtro de tenant_id explícito é
  // obrigatório, senão `.find()` pode pegar o papel de outro tenant com o mesmo nome
  // (achado real pela CI ao escrever devices.test.ts, ver ADR-027).
  const bellaRoles = await withTenant(ownerDb.db, bellaTenantId, (tx) =>
    tx.select().from(schema.roles).where(eq(schema.roles.tenantId, bellaTenantId)),
  );
  const cashierRoleId = bellaRoles.find((r) => r.name === 'cashier')!.id;

  auth = createAuth({
    db: appDb.db,
    secret: BETTER_AUTH_SECRET,
    webOrigin: undefined,
    baseURL: 'http://localhost:3001',
  });

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

  const signUp = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    payload: { name: 'Caixa de Teste', email, password },
  });
  if (signUp.statusCode !== 200) throw new Error(`sign-up falhou: ${signUp.body}`);
  const userId = (signUp.json() as { user: { id: string } }).user.id;

  // Membership como "cashier" só no tenant Bella — nunca no Demo (prova de isolamento).
  // Gravada como o DONO (withTenant sobre ownerDb) porque criar membership é uma
  // operação administrativa; o que este teste prova é a LEITURA/checagem via bella_app.
  await withTenant(ownerDb.db, bellaTenantId, (tx) =>
    tx
      .insert(schema.memberships)
      .values({ id: newId(), userId, tenantId: bellaTenantId, roleId: cashierRoleId }),
  );
});

afterAll(async () => {
  await app.close();
  await appDb.close();
  await ownerDb.close();
});

describe('resolveActor / requirePermission (via bella_app)', () => {
  it('sem sessão: UNAUTHENTICATED', async () => {
    await expect(
      resolveActor(fakeRequest({ 'x-tenant-id': bellaTenantId }), appDb.db, auth),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('sessão válida sem X-Tenant-Id: TENANT_MISMATCH', async () => {
    const cookie = await sessionCookie();
    await expect(resolveActor(fakeRequest({ cookie }), appDb.db, auth)).rejects.toMatchObject({
      code: 'TENANT_MISMATCH',
    });
  });

  it('sessão válida + tenant onde não tem membership: TENANT_MISMATCH (não vaza se o tenant existe)', async () => {
    const cookie = await sessionCookie();
    await expect(
      resolveActor(fakeRequest({ cookie, 'x-tenant-id': demoTenantId }), appDb.db, auth),
    ).rejects.toMatchObject({ code: 'TENANT_MISMATCH' });
  });

  it('positivo: cashier consegue payments.record no tenant onde tem membership', async () => {
    const cookie = await sessionCookie();
    const actor = await resolveActor(
      fakeRequest({ cookie, 'x-tenant-id': bellaTenantId }),
      appDb.db,
      auth,
    );
    expect(actor.permissions).toContain('payments.record');
    expect(actor.tenantId).toBe(bellaTenantId);

    const middleware = requirePermission(appDb.db, auth, 'payments.record');
    await expect(
      middleware(fakeRequest({ cookie, 'x-tenant-id': bellaTenantId }), {} as never),
    ).resolves.toBeUndefined();
  });

  it('negativo: cashier não consegue users.manage (permissão de outro papel)', async () => {
    const cookie = await sessionCookie();
    const middleware = requirePermission(appDb.db, auth, 'users.manage');
    await expect(
      middleware(fakeRequest({ cookie, 'x-tenant-id': bellaTenantId }), {} as never),
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  });

  it('negativo: cashier não tem orders.cancel.after_production (mais sensível que a rotina)', async () => {
    const cookie = await sessionCookie();
    const middleware = requirePermission(appDb.db, auth, 'orders.cancel.after_production');
    await expect(
      middleware(fakeRequest({ cookie, 'x-tenant-id': bellaTenantId }), {} as never),
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  });
});
