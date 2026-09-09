import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDb, schema, withTenant, withoutTenant, type DbHandle } from '@bella/db';
import { runMigrations } from '@bella/db/migrate';
import { seed, SEED_TENANTS } from '@bella/db/seed';
import { setAppRolePassword } from '@bella/db/set-app-role-password';
import { newId } from '@bella/domain';
import { setMembershipPin, verifyMembershipPin } from '../../src/modules/identity/devices/service';

/**
 * PIN de operador (M3, ACTIVE_PLAN.md critério 2): certo passa, errado nega, N+1
 * tentativas bloqueia, e o bloqueio expira. Testado direto contra `service.ts` (sem
 * HTTP — a parte de transporte já é coberta por `devices.test.ts`), conectando como
 * `bella_app` para não esconder bug de isolamento (mesma disciplina do M1/M2).
 */
const ownerUrl = process.env.TEST_DATABASE_URL;
const appPassword = process.env.APP_DB_PASSWORD;
const appUrl = process.env.TEST_APP_DATABASE_URL;
if (!ownerUrl || !appPassword || !appUrl) {
  throw new Error(
    'TEST_DATABASE_URL, APP_DB_PASSWORD e TEST_APP_DATABASE_URL precisam estar definidas.',
  );
}

let ownerDb: DbHandle;
let appDb: DbHandle;
let bellaTenantId: string;
let membershipId: string;

beforeAll(async () => {
  await runMigrations(ownerUrl);
  await setAppRolePassword(ownerUrl, appPassword);
  ownerDb = createDb(ownerUrl, { max: 2 });
  appDb = createDb(appUrl, { max: 2 });
  await seed(ownerDb.db);

  const bellaSpec = SEED_TENANTS.find((t) => t.slug === 'bella')!;
  const tenantRows = await withoutTenant(ownerDb.db, (tx) =>
    tx.select({ id: schema.tenants.id, slug: schema.tenants.slug }).from(schema.tenants),
  );
  bellaTenantId = tenantRows.find((r) => r.slug === bellaSpec.slug)!.id;

  // `ownerDb` ignora RLS (é o dono do banco) — filtro de tenant_id explícito é
  // obrigatório, senão `.find()` pode pegar o papel de outro tenant com o mesmo nome.
  const roles = await withTenant(ownerDb.db, bellaTenantId, (tx) =>
    tx.select().from(schema.roles).where(eq(schema.roles.tenantId, bellaTenantId)),
  );
  const roleId = roles.find((r) => r.name === 'waiter')!.id;
  const userId = newId();
  await withoutTenant(ownerDb.db, (tx) =>
    tx
      .insert(schema.users)
      .values({ id: userId, email: `garcom-${newId()}@example.com`, name: 'Garçom de Teste' }),
  );
  const [membership] = await withTenant(ownerDb.db, bellaTenantId, (tx) =>
    tx
      .insert(schema.memberships)
      .values({ id: newId(), userId, tenantId: bellaTenantId, roleId })
      .returning({ id: schema.memberships.id }),
  );
  membershipId = membership!.id;
});

afterAll(async () => {
  await appDb.close();
  await ownerDb.close();
});

describe('setMembershipPin / verifyMembershipPin', () => {
  it('PIN certo verifica com sucesso', async () => {
    await setMembershipPin(appDb.db, bellaTenantId, membershipId, '2468');
    const result = await verifyMembershipPin(appDb.db, bellaTenantId, membershipId, '2468');
    expect(result.membershipId).toBe(membershipId);
  });

  it('PIN errado é negado e conta como tentativa', async () => {
    await setMembershipPin(appDb.db, bellaTenantId, membershipId, '1111');

    await expect(
      verifyMembershipPin(appDb.db, bellaTenantId, membershipId, '9999'),
    ).rejects.toMatchObject({
      code: 'PERMISSION_DENIED',
    });

    const [row] = await withTenant(ownerDb.db, bellaTenantId, (tx) =>
      tx.select().from(schema.memberships).where(eq(schema.memberships.id, membershipId)),
    );
    expect(row!.pinFailedAttempts).toBeGreaterThanOrEqual(1);
  });

  it('bloqueia depois de 5 tentativas erradas', async () => {
    await setMembershipPin(appDb.db, bellaTenantId, membershipId, '3333');

    for (let i = 0; i < 5; i++) {
      await expect(
        verifyMembershipPin(appDb.db, bellaTenantId, membershipId, '0000'),
      ).rejects.toMatchObject({
        code: 'PERMISSION_DENIED',
      });
    }

    // a 6ª tentativa, mesmo com o PIN CERTO, é negada porque já está bloqueado
    await expect(
      verifyMembershipPin(appDb.db, bellaTenantId, membershipId, '3333'),
    ).rejects.toMatchObject({
      code: 'PERMISSION_DENIED',
    });

    const [row] = await withTenant(ownerDb.db, bellaTenantId, (tx) =>
      tx.select().from(schema.memberships).where(eq(schema.memberships.id, membershipId)),
    );
    expect(row!.pinLockedUntil).not.toBeNull();
    expect(row!.pinLockedUntil!.getTime()).toBeGreaterThan(Date.now());
  });

  it('bloqueio expira: depois do prazo, o PIN certo volta a funcionar', async () => {
    await setMembershipPin(appDb.db, bellaTenantId, membershipId, '7777');
    // Simula o bloqueio já vencido sem esperar 15 minutos de verdade — manipulação
    // direta do dado de teste (não é um caminho de produção).
    await withTenant(ownerDb.db, bellaTenantId, (tx) =>
      tx
        .update(schema.memberships)
        .set({ pinFailedAttempts: 5, pinLockedUntil: new Date(Date.now() - 1000) })
        .where(eq(schema.memberships.id, membershipId)),
    );

    const result = await verifyMembershipPin(appDb.db, bellaTenantId, membershipId, '7777');
    expect(result.membershipId).toBe(membershipId);

    const [row] = await withTenant(ownerDb.db, bellaTenantId, (tx) =>
      tx.select().from(schema.memberships).where(eq(schema.memberships.id, membershipId)),
    );
    expect(row!.pinFailedAttempts).toBe(0);
    expect(row!.pinLockedUntil).toBeNull();
  });

  it('membership sem PIN configurado é negado (não tenta comparar com hash inexistente)', async () => {
    const roles = await withTenant(ownerDb.db, bellaTenantId, (tx) =>
      tx.select().from(schema.roles).where(eq(schema.roles.tenantId, bellaTenantId)),
    );
    const roleId = roles.find((r) => r.name === 'kitchen')!.id;
    const userId = newId();
    await withoutTenant(ownerDb.db, (tx) =>
      tx
        .insert(schema.users)
        .values({ id: userId, email: `cozinha-${newId()}@example.com`, name: 'Cozinha sem PIN' }),
    );
    const [membership] = await withTenant(ownerDb.db, bellaTenantId, (tx) =>
      tx
        .insert(schema.memberships)
        .values({ id: newId(), userId, tenantId: bellaTenantId, roleId })
        .returning({ id: schema.memberships.id }),
    );
    await expect(
      verifyMembershipPin(appDb.db, bellaTenantId, membership!.id, '1234'),
    ).rejects.toMatchObject({
      code: 'PERMISSION_DENIED',
    });
  });
});
