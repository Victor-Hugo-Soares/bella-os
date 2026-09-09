import {
  bigserial,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { idColumn, timestamps } from './_columns';
import { tenantIsolationPolicy } from './_rls';
import { tenants } from './platform';

/**
 * Tabelas transversais (DOMAIN_MODEL.md §1.8): auditoria, outbox de eventos, idempotência
 * e fila de jobs. Todas com RLS por tenant. `audit_log` e `jobs` aceitam `tenant_id`
 * nulo para ações de plataforma — a mesma política deixa essas linhas invisíveis para
 * qualquer contexto de tenant (NULL nunca é igual a um uuid); reservado para quando
 * existir um caminho de superadmin (Fase G), nenhum código grava tenant_id nulo hoje.
 */

export const auditLog = pgTable(
  'audit_log',
  {
    id: idColumn(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    actorType: text('actor_type').notNull(),
    actorId: text('actor_id'),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    before: jsonb('before'),
    after: jsonb('after'),
    requestId: text('request_id'),
    ip: text('ip'),
    at: timestamp('at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('audit_log_tenant_id_at_idx').on(t.tenantId, t.at),
    check(
      'audit_log_actor_type_check',
      sql`${t.actorType} in ('user', 'device', 'guest', 'system')`,
    ),
    tenantIsolationPolicy(t.tenantId),
  ],
).enableRLS();

export const domainEvents = pgTable(
  'domain_events',
  {
    seq: bigserial('seq', { mode: 'bigint' }).notNull(),
    id: idColumn(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    channel: text('channel').notNull(),
    type: text('type').notNull(),
    payload: jsonb('payload').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('domain_events_seq_key').on(t.seq),
    index('domain_events_tenant_id_seq_idx').on(t.tenantId, t.seq),
    tenantIsolationPolicy(t.tenantId),
  ],
).enableRLS();

export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    id: idColumn(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    scope: text('scope').notNull(),
    key: text('key').notNull(),
    requestHash: text('request_hash').notNull(),
    responseStatus: integer('response_status'),
    responseBody: jsonb('response_body'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex('idempotency_keys_tenant_id_scope_key_key').on(t.tenantId, t.scope, t.key),
    tenantIsolationPolicy(t.tenantId),
  ],
).enableRLS();

export const jobs = pgTable(
  'jobs',
  {
    id: idColumn(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    payload: jsonb('payload').notNull().default({}),
    runAt: timestamp('run_at', { withTimezone: true }).defaultNow().notNull(),
    attempts: integer('attempts').notNull().default(0),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    lockedBy: text('locked_by'),
    status: text('status').notNull().default('pending'),
    lastError: text('last_error'),
    ...timestamps,
  },
  (t) => [
    index('jobs_status_run_at_idx').on(t.status, t.runAt),
    check('jobs_status_check', sql`${t.status} in ('pending', 'running', 'done', 'failed')`),
    tenantIsolationPolicy(t.tenantId),
  ],
).enableRLS();
