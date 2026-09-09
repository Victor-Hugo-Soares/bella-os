import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { createDb, schema, withTenant, withoutTenant, type DbHandle } from '@bella/db';
import { runMigrations } from '@bella/db/migrate';
import { seed, SEED_TENANTS } from '@bella/db/seed';
import { setAppRolePassword } from '@bella/db/set-app-role-password';
import { newId } from '@bella/domain';
import { expectPgErrorMatching } from './_pg-error';

/**
 * (e) Prova que uma mutação de negócio + auditoria + evento de outbox nascem juntos,
 * na mesma transação — e que uma falha no meio do caminho não deixa nada gravado
 * (ACTIVE_PLAN.md M1, critério e; ARCHITECTURE.md §7 outbox).
 * (f) Prova a constraint de idempotência (DOMAIN_MODEL.md §1.8).
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
let tenantId: string;

beforeAll(async () => {
  await runMigrations(ownerUrl);
  await setAppRolePassword(ownerUrl, appPassword);
  ownerDb = createDb(ownerUrl, { max: 2 });
  appDb = createDb(appUrl, { max: 2 });
  await seed(ownerDb.db);

  const bellaSpec = SEED_TENANTS.find((t) => t.slug === 'bella')!;
  const rows = await withoutTenant(ownerDb.db, (tx) =>
    tx
      .select({ id: schema.tenants.id })
      .from(schema.tenants)
      .where(sql`${schema.tenants.slug} = ${bellaSpec.slug}`),
  );
  tenantId = rows[0]!.id;
});

afterAll(async () => {
  await ownerDb?.close();
  await appDb?.close();
});

describe('(e) mutação + auditoria + outbox na mesma transação', () => {
  it('sucesso: papel, audit_log e domain_events aparecem juntos', async () => {
    const roleId = newId();
    const roleName = `promo-${roleId.slice(0, 8)}`;

    await withTenant(appDb.db, tenantId, async (tx) => {
      await tx.insert(schema.roles).values({ id: roleId, tenantId, name: roleName });
      await tx.insert(schema.auditLog).values({
        tenantId,
        actorType: 'system',
        actorId: 'test-suite',
        action: 'role.create',
        entityType: 'role',
        entityId: roleId,
        after: { name: roleName },
      });
      await tx.insert(schema.domainEvents).values({
        id: newId(),
        tenantId,
        channel: 'admin',
        type: 'role.created',
        payload: { roleId, name: roleName },
      });
    });

    const [roleRows, auditRows, eventRows] = await withTenant(appDb.db, tenantId, async (tx) => [
      await tx
        .select()
        .from(schema.roles)
        .where(sql`${schema.roles.id} = ${roleId}`),
      await tx
        .select()
        .from(schema.auditLog)
        .where(sql`${schema.auditLog.entityId} = ${roleId}`),
      await tx
        .select()
        .from(schema.domainEvents)
        .where(
          sql`${schema.domainEvents.type} = 'role.created' and ${schema.domainEvents.payload}->>'roleId' = ${roleId}`,
        ),
    ]);
    expect(roleRows).toHaveLength(1);
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]?.action).toBe('role.create');
    expect(eventRows).toHaveLength(1);
  });

  it('falha no meio da transação não deixa nada gravado (atomicidade real, não só no papel)', async () => {
    const roleId = newId();
    const roleName = `deveria-sumir-${roleId.slice(0, 8)}`;

    await expect(
      withTenant(appDb.db, tenantId, async (tx) => {
        await tx.insert(schema.roles).values({ id: roleId, tenantId, name: roleName });
        // Falha deliberada: domain_events.type é NOT NULL — omitido via SQL bruto para
        // forçar a violação de constraint no meio da transação.
        await tx.execute(sql`
          insert into domain_events (id, tenant_id, channel, payload)
          values (${newId()}, ${tenantId}, 'admin', '{}'::jsonb)
        `);
      }),
    ).rejects.toThrow();

    const survived = await withoutTenant(ownerDb.db, (tx) =>
      tx
        .select({ id: schema.roles.id })
        .from(schema.roles)
        .where(sql`${schema.roles.id} = ${roleId}`),
    );
    expect(survived).toHaveLength(0);
  });
});

describe('(f) idempotency_keys tem UNIQUE (tenant_id, scope, key)', () => {
  it('a mesma chave duas vezes no mesmo escopo é rejeitada pelo banco', async () => {
    const key = `test-${newId()}`;
    const insertOnce = () =>
      withTenant(appDb.db, tenantId, (tx) =>
        tx.insert(schema.idempotencyKeys).values({
          tenantId,
          scope: 'orders.create',
          key,
          requestHash: 'abc123',
          expiresAt: new Date(Date.now() + 60_000),
        }),
      );

    await insertOnce();
    await expectPgErrorMatching(insertOnce(), /duplicate key|unique/i);
  });

  it('a mesma chave em escopos diferentes é permitida (a unicidade é por escopo)', async () => {
    const key = `test-${newId()}`;
    await withTenant(appDb.db, tenantId, async (tx) => {
      await tx.insert(schema.idempotencyKeys).values({
        tenantId,
        scope: 'orders.create',
        key,
        requestHash: 'x',
        expiresAt: new Date(Date.now() + 60_000),
      });
      await tx.insert(schema.idempotencyKeys).values({
        tenantId,
        scope: 'payments.record',
        key,
        requestHash: 'y',
        expiresAt: new Date(Date.now() + 60_000),
      });
    });
    const rows = await withTenant(appDb.db, tenantId, (tx) =>
      tx
        .select({ scope: schema.idempotencyKeys.scope })
        .from(schema.idempotencyKeys)
        .where(sql`${schema.idempotencyKeys.key} = ${key}`),
    );
    expect(rows).toHaveLength(2);
  });
});
