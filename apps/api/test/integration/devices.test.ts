import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { createDb, schema, withTenant, withoutTenant, type DbHandle } from '@bella/db';
import { runMigrations } from '@bella/db/migrate';
import { seed, SEED_TENANTS } from '@bella/db/seed';
import { setAppRolePassword } from '@bella/db/set-app-role-password';
import { newId } from '@bella/domain';
import { buildApp } from '../../src/app';
import { loadConfig } from '../../src/config';

/**
 * Pareamento de dispositivo de ponta a ponta pela API real, conectada como `bella_app`
 * (mesma justificativa do M2: testar com a conexão de dono esconderia bug de
 * isolamento). Cobre os critérios 1 e 3 do plano do M3.
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
let bellaOwnerMembershipId: string;

const bellaOwnerEmail = `owner-${newId()}@example.com`;
const demoOwnerEmail = `owner-${newId()}@example.com`;
const password = 'senha-forte-000111';

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

  // Dono do Bella (permissão devices.manage já vem no papel "owner" do seed)
  const bellaRoles = await withTenant(ownerDb.db, bellaTenantId, (tx) =>
    tx.select().from(schema.roles),
  );
  const bellaOwnerRoleId = bellaRoles.find((r) => r.name === 'owner')!.id;
  const bellaSignUp = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    payload: { name: 'Dono Bella', email: bellaOwnerEmail, password },
  });
  const bellaUserId = (bellaSignUp.json() as { user: { id: string } }).user.id;
  const [bellaMembership] = await withTenant(ownerDb.db, bellaTenantId, (tx) =>
    tx
      .insert(schema.memberships)
      .values({
        id: newId(),
        userId: bellaUserId,
        tenantId: bellaTenantId,
        roleId: bellaOwnerRoleId,
      })
      .returning({ id: schema.memberships.id }),
  );
  bellaOwnerMembershipId = bellaMembership!.id;

  // Dono do Demo — só para o teste de isolamento entre tenants.
  const demoRoles = await withTenant(ownerDb.db, demoTenantId, (tx) =>
    tx.select().from(schema.roles),
  );
  const demoOwnerRoleId = demoRoles.find((r) => r.name === 'owner')!.id;
  const demoSignUp = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    payload: { name: 'Dono Demo', email: demoOwnerEmail, password },
  });
  const demoUserId = (demoSignUp.json() as { user: { id: string } }).user.id;
  await withTenant(ownerDb.db, demoTenantId, (tx) =>
    tx
      .insert(schema.memberships)
      .values({ id: newId(), userId: demoUserId, tenantId: demoTenantId, roleId: demoOwnerRoleId }),
  );
});

afterAll(async () => {
  await app.close();
  await appDb.close();
  await ownerDb.close();
});

describe('pareamento de dispositivo', () => {
  it('gerar código → trocar por token → token funciona numa rota autenticada por dispositivo', async () => {
    const cookie = await login(bellaOwnerEmail);

    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/devices/pairing-codes',
      headers: { cookie, 'x-tenant-id': bellaTenantId },
      payload: { deviceKind: 'kds', deviceName: 'Tablet Cozinha 1' },
    });
    expect(createRes.statusCode, createRes.body).toBe(200);
    const { code } = createRes.json() as { code: string; expiresAt: string };
    expect(code).toMatch(/^\d{6}$/);

    const exchangeRes = await app.inject({
      method: 'POST',
      url: '/v1/devices/exchange',
      payload: { code },
    });
    expect(exchangeRes.statusCode, exchangeRes.body).toBe(201);
    const { token, deviceId } = exchangeRes.json() as { token: string; deviceId: string };
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(20);

    // define um PIN para o dono e confirma que o dispositivo recém-pareado consegue
    // verificar esse PIN — prova de ponta a ponta que o token de fato autentica.
    await app.inject({
      method: 'POST',
      url: '/v1/me/pin',
      headers: { cookie, 'x-tenant-id': bellaTenantId },
      payload: { pin: '135790' },
    });
    const verifyRes = await app.inject({
      method: 'POST',
      url: '/v1/devices/pin/verify',
      headers: { 'x-device-token': token },
      payload: { membershipId: bellaOwnerMembershipId, pin: '135790' },
    });
    expect(verifyRes.statusCode, verifyRes.body).toBe(200);
    expect(verifyRes.json().membershipId).toBe(bellaOwnerMembershipId);

    // dispositivo aparece na listagem do tenant certo, com last_seen_at atualizado
    const listRes = await app.inject({
      method: 'GET',
      url: '/v1/devices',
      headers: { cookie, 'x-tenant-id': bellaTenantId },
    });
    const devices = listRes.json().devices as Array<{ id: string; lastSeenAt: string | null }>;
    const found = devices.find((d) => d.id === deviceId);
    expect(found).toBeDefined();
    expect(found!.lastSeenAt).not.toBeNull();
  });

  it('código já usado é rejeitado (não pode ser trocado duas vezes)', async () => {
    const cookie = await login(bellaOwnerEmail);
    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/devices/pairing-codes',
      headers: { cookie, 'x-tenant-id': bellaTenantId },
      payload: { deviceKind: 'cashier', deviceName: 'Caixa 1' },
    });
    const { code } = createRes.json() as { code: string };

    const first = await app.inject({
      method: 'POST',
      url: '/v1/devices/exchange',
      payload: { code },
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: 'POST',
      url: '/v1/devices/exchange',
      payload: { code },
    });
    expect(second.statusCode).toBe(404);
  });

  it('código expirado é rejeitado', async () => {
    const cookie = await login(bellaOwnerEmail);
    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/devices/pairing-codes',
      headers: { cookie, 'x-tenant-id': bellaTenantId },
      payload: { deviceKind: 'floor', deviceName: 'Tablet Salão' },
    });
    const { code } = createRes.json() as { code: string };

    // Simula o TTL vencido sem esperar 10 minutos de verdade — manipulação direta do
    // dado de teste, não um caminho de produção.
    await withoutTenant(ownerDb.db, (tx) =>
      tx
        .update(schema.pairingCodes)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(schema.pairingCodes.code, code)),
    );

    const res = await app.inject({
      method: 'POST',
      url: '/v1/devices/exchange',
      payload: { code },
    });
    expect(res.statusCode).toBe(404);
  });

  it('token de dispositivo revogado deixa de funcionar', async () => {
    const cookie = await login(bellaOwnerEmail);
    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/devices/pairing-codes',
      headers: { cookie, 'x-tenant-id': bellaTenantId },
      payload: { deviceKind: 'kds', deviceName: 'Tablet a revogar' },
    });
    const { code } = createRes.json() as { code: string };
    const exchangeRes = await app.inject({
      method: 'POST',
      url: '/v1/devices/exchange',
      payload: { code },
    });
    const { token, deviceId } = exchangeRes.json() as { token: string; deviceId: string };

    const revokeRes = await app.inject({
      method: 'POST',
      url: `/v1/devices/${deviceId}/revoke`,
      headers: { cookie, 'x-tenant-id': bellaTenantId },
    });
    expect(revokeRes.statusCode, revokeRes.body).toBe(200);

    const verifyRes = await app.inject({
      method: 'POST',
      url: '/v1/devices/pin/verify',
      headers: { 'x-device-token': token },
      payload: { membershipId: bellaOwnerMembershipId, pin: '000000' },
    });
    expect(verifyRes.statusCode).toBe(401);
  });

  it('dispositivo de um tenant não consegue verificar PIN de membership de outro tenant', async () => {
    const demoCookie = await login(demoOwnerEmail);
    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/devices/pairing-codes',
      headers: { cookie: demoCookie, 'x-tenant-id': demoTenantId },
      payload: { deviceKind: 'kds', deviceName: 'Tablet Demo' },
    });
    const { code } = createRes.json() as { code: string };
    const exchangeRes = await app.inject({
      method: 'POST',
      url: '/v1/devices/exchange',
      payload: { code },
    });
    const { token: demoDeviceToken } = exchangeRes.json() as { token: string };

    // dispositivo do Demo tentando verificar PIN do dono do Bella — RLS de memberships
    // bloqueia a leitura porque o contexto é o tenant Demo, não o Bella.
    const verifyRes = await app.inject({
      method: 'POST',
      url: '/v1/devices/pin/verify',
      headers: { 'x-device-token': demoDeviceToken },
      payload: { membershipId: bellaOwnerMembershipId, pin: '135790' },
    });
    expect(verifyRes.statusCode).toBe(403);
  });

  it('geração de código sem permissão devices.manage é negada', async () => {
    // usuário sem nenhuma membership não passa nem da checagem de tenant/permissão
    const email = `sem-permissao-${newId()}@example.com`;
    await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: { name: 'Ninguém', email, password },
    });
    const cookie = await login(email);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/devices/pairing-codes',
      headers: { cookie, 'x-tenant-id': bellaTenantId },
      payload: { deviceKind: 'kds', deviceName: 'x' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('colisão de código gerado é tratada com retry (sem exceção não tratada)', async () => {
    // Prova indireta: gerar vários códigos em sequência rápida nunca falha por
    // colisão sem retry (o service.ts trata `duplicate key` internamente).
    const cookie = await login(bellaOwnerEmail);
    for (let i = 0; i < 5; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/devices/pairing-codes',
        headers: { cookie, 'x-tenant-id': bellaTenantId },
        payload: { deviceKind: 'admin', deviceName: `Admin ${i}` },
      });
      expect(res.statusCode, res.body).toBe(200);
    }
  });
});

describe('inspeção independente', () => {
  it('nenhum token de dispositivo é gravado em texto puro no banco (só o hash)', async () => {
    const cookie = await login(bellaOwnerEmail);
    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/devices/pairing-codes',
      headers: { cookie, 'x-tenant-id': bellaTenantId },
      payload: { deviceKind: 'kds', deviceName: 'Inspecionado' },
    });
    const { code } = createRes.json() as { code: string };
    const exchangeRes = await app.inject({
      method: 'POST',
      url: '/v1/devices/exchange',
      payload: { code },
    });
    const { token, deviceId } = exchangeRes.json() as { token: string; deviceId: string };

    const [row] = await withoutTenant(ownerDb.db, (tx) =>
      tx
        .select({ tokenHash: schema.devices.tokenHash })
        .from(schema.devices)
        .where(eq(schema.devices.id, deviceId)),
    );
    expect(row!.tokenHash).not.toBe(token);
    expect(row!.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });
});
