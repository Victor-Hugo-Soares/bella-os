import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { createDb, schema, withTenant, withoutTenant, type DbHandle } from '@bella/db';
import { runMigrations } from '@bella/db/migrate';
import { seed, SEED_TENANTS } from '@bella/db/seed';
import { setAppRolePassword } from '@bella/db/set-app-role-password';
import { expectPgErrorMatching } from './_pg-error';

/**
 * Prova o isolamento entre tenants (ADR-004, DOMAIN_MODEL.md §3, ACTIVE_PLAN.md M1
 * critérios a-d). `ownerDb` conecta como dono do banco (roda migrations/seed).
 * `appDb` conecta como `bella_app` — o papel restrito que a API usa de fato — e é quem
 * prova a isolação de verdade: sem BYPASSRLS, sem ser dono, sujeito às policies.
 */
const ownerUrl = process.env.TEST_DATABASE_URL;
const appPassword = process.env.APP_DB_PASSWORD;
const appUrl = process.env.TEST_APP_DATABASE_URL;
if (!ownerUrl || !appPassword || !appUrl) {
  throw new Error(
    'TEST_DATABASE_URL, APP_DB_PASSWORD e TEST_APP_DATABASE_URL precisam estar definidas (ver .env.example).',
  );
}

let ownerDb: DbHandle;
let appDb: DbHandle;
let bellaTenantId: string;
let demoTenantId: string;

beforeAll(async () => {
  await runMigrations(ownerUrl);
  await setAppRolePassword(ownerUrl, appPassword);
  ownerDb = createDb(ownerUrl, { max: 2 });
  appDb = createDb(appUrl, { max: 2 });
  await seed(ownerDb.db);

  const bellaSpec = SEED_TENANTS.find((t) => t.slug === 'bella')!;
  const demoSpec = SEED_TENANTS.find((t) => t.slug === 'demo')!;
  const rows = await withoutTenant(ownerDb.db, (tx) =>
    tx.select({ id: schema.tenants.id, slug: schema.tenants.slug }).from(schema.tenants),
  );
  bellaTenantId = rows.find((r) => r.slug === bellaSpec.slug)!.id;
  demoTenantId = rows.find((r) => r.slug === demoSpec.slug)!.id;
  expect(bellaTenantId).toBeTruthy();
  expect(demoTenantId).toBeTruthy();
  expect(bellaTenantId).not.toBe(demoTenantId);
});

afterAll(async () => {
  await ownerDb?.close();
  await appDb?.close();
});

describe('(a) isolamento entre tenants — bella_app nunca vê linha de outro tenant', () => {
  it('roles do tenant bella não incluem nenhuma linha do tenant demo', async () => {
    const bellaRoles = await withTenant(appDb.db, bellaTenantId, (tx) =>
      tx.select({ id: schema.roles.id, tenantId: schema.roles.tenantId }).from(schema.roles),
    );
    expect(bellaRoles.length).toBeGreaterThan(0);
    expect(bellaRoles.every((r) => r.tenantId === bellaTenantId)).toBe(true);
    expect(bellaRoles.some((r) => r.tenantId === demoTenantId)).toBe(false);
  });

  it('o mesmo se repete trocando o contexto para demo (não é coincidência de dados)', async () => {
    const demoRoles = await withTenant(appDb.db, demoTenantId, (tx) =>
      tx.select({ id: schema.roles.id, tenantId: schema.roles.tenantId }).from(schema.roles),
    );
    expect(demoRoles.length).toBeGreaterThan(0);
    expect(demoRoles.every((r) => r.tenantId === demoTenantId)).toBe(true);
  });

  it('SQL direto com filtro cruzado também devolve zero linhas (não é um efeito só do ORM)', async () => {
    const result = await withTenant(appDb.db, bellaTenantId, (tx) =>
      tx.execute<{ count: string }>(
        sql`select count(*)::text as count from roles where tenant_id = ${demoTenantId}`,
      ),
    );
    expect(result.rows[0]?.count).toBe('0');
  });
});

describe('(b) insert com tenant_id divergente do contexto é rejeitado', () => {
  it('INSERT em roles com tenant_id de outro tenant viola a policy (RLS), não a aplicação', async () => {
    await expectPgErrorMatching(
      withTenant(appDb.db, bellaTenantId, (tx) =>
        tx.insert(schema.roles).values({
          id: '99999999-9999-4999-8999-999999999999',
          tenantId: demoTenantId, // divergente do contexto (bellaTenantId) de propósito
          name: 'papel-invasor',
        }),
      ),
      /row-level security/i,
    );

    // confirma que nada foi persistido (nem no tenant certo, nem no errado)
    const found = await withoutTenant(ownerDb.db, (tx) =>
      tx
        .select({ id: schema.roles.id })
        .from(schema.roles)
        .where(sql`${schema.roles.id} = '99999999-9999-4999-8999-999999999999'`),
    );
    expect(found).toHaveLength(0);
  });
});

describe('(c) sem contexto de tenant, nenhuma linha é visível', () => {
  it('SELECT em roles sem app.tenant_id definido devolve zero linhas, mesmo havendo dados', async () => {
    const rows = await withoutTenant(appDb.db, (tx) =>
      tx.select({ id: schema.roles.id }).from(schema.roles),
    );
    expect(rows).toHaveLength(0);
  });

  it('o mesmo vale para memberships, tenant_settings, domain_events e idempotency_keys', async () => {
    const [m, ts, de, ik] = await withoutTenant(appDb.db, async (tx) => [
      await tx.select({ id: schema.memberships.id }).from(schema.memberships),
      await tx.select({ tenantId: schema.tenantSettings.tenantId }).from(schema.tenantSettings),
      await tx.select({ id: schema.domainEvents.id }).from(schema.domainEvents),
      await tx.select({ id: schema.idempotencyKeys.id }).from(schema.idempotencyKeys),
    ]);
    expect(m).toHaveLength(0);
    expect(ts).toHaveLength(0);
    expect(de).toHaveLength(0);
    expect(ik).toHaveLength(0);
  });
});

describe('(d) bella_app não é dono das tabelas e não tem BYPASSRLS', () => {
  it('pg_roles.rolbypassrls e rolsuper são false para bella_app', async () => {
    const result = await ownerDb.db.execute<{ rolbypassrls: boolean; rolsuper: boolean }>(
      sql`select rolbypassrls, rolsuper from pg_roles where rolname = 'bella_app'`,
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.rolbypassrls).toBe(false);
    expect(result.rows[0]?.rolsuper).toBe(false);
  });

  it('bella_app não é o dono da tabela tenants nem de roles', async () => {
    const result = await ownerDb.db.execute<{ tablename: string; tableowner: string }>(
      sql`select tablename, tableowner from pg_tables where tablename in ('tenants', 'roles') and schemaname = 'public'`,
    );
    expect(result.rows).toHaveLength(2);
    for (const row of result.rows) {
      expect(row.tableowner).not.toBe('bella_app');
    }
  });

  it('RLS está habilitada nas tabelas com tenant_id (e não nas globais)', async () => {
    const result = await ownerDb.db.execute<{ relname: string; relrowsecurity: boolean }>(
      sql`select relname, relrowsecurity from pg_class
          where relname in ('roles', 'memberships', 'tenant_settings', 'domain_events',
                             'idempotency_keys', 'role_permissions', 'audit_log', 'jobs',
                             'tenants', 'organizations', 'users')
          order by relname`,
    );
    const byName = Object.fromEntries(result.rows.map((r) => [r.relname, r.relrowsecurity]));
    for (const t of [
      'roles',
      'memberships',
      'tenant_settings',
      'domain_events',
      'idempotency_keys',
      'role_permissions',
      'audit_log',
      'jobs',
    ]) {
      expect(byName[t], `${t} deveria ter RLS habilitada`).toBe(true);
    }
    for (const t of ['tenants', 'organizations', 'users']) {
      expect(byName[t], `${t} é global e não deveria ter RLS`).toBe(false);
    }
  });
});
