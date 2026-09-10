import {
  boolean,
  check,
  integer,
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
import { users } from './identity';

/**
 * Mesas, sessão de mesa, comandas e clientes (DOMAIN_MODEL.md §1.4, M6). Tabelas de
 * negócio normais: `tenant_id` + RLS (ADR-021), sem exceção — diferente de `devices`/
 * `pairing_codes` (ADR-025). A rota pública (`/public/*`) resolve o tenant por
 * `tenants.slug` (tabela global, sem RLS) ANTES de entrar em `withTenant()` — mesmo
 * princípio de "descobrir o tenant primeiro" de `resolveDeviceActor`, só que a chave
 * inicial aqui é o slug da URL, não um hash de token.
 *
 * Escopo do M6 (ACTIVE_PLAN.md): sem `service_requests` (chamar garçom/pedir conta —
 * Fase C, precisa de UI de salão que ainda não existe) e sem
 * `table_session_transfers` (transferência de mesa é M11) — reservados, não modelados.
 */

export const areas = pgTable(
  'areas',
  {
    id: idColumn(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('areas_tenant_id_name_key').on(t.tenantId, t.name),
    tenantIsolationPolicy(t.tenantId),
  ],
).enableRLS();

export const tables = pgTable(
  'tables',
  {
    id: idColumn(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    areaId: uuid('area_id').references(() => areas.id, { onDelete: 'set null' }),
    label: text('label').notNull(),
    seats: integer('seats').notNull().default(2),
    // Curto e NÃO sequencial (@bella/domain generateTableCode) — DOMAIN_MODEL.md §1.4.
    qrCode: text('qr_code').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('tables_tenant_id_label_key').on(t.tenantId, t.label),
    uniqueIndex('tables_qr_code_key').on(t.qrCode),
    tenantIsolationPolicy(t.tenantId),
  ],
).enableRLS();

export const tableSessions = pgTable(
  'table_sessions',
  {
    id: idColumn(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    tableId: uuid('table_id')
      .notNull()
      .references(() => tables.id, { onDelete: 'restrict' }),
    status: text('status').notNull().default('open'),
    openedAt: timestamp('opened_at', { withTimezone: true }).defaultNow().notNull(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    openedBy: text('opened_by').notNull(),
    openedByUserId: uuid('opened_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    verifiedBy: uuid('verified_by').references(() => users.id, { onDelete: 'set null' }),
    guestCount: integer('guest_count'),
    closedReason: text('closed_reason'),
    ...timestamps,
  },
  (t) => [
    check('table_sessions_status_check', sql`${t.status} in ('open', 'closing', 'closed')`),
    check('table_sessions_opened_by_check', sql`${t.openedBy} in ('customer', 'staff')`),
    // Invariante central do M6: só uma sessão NÃO FECHADA por mesa (DOMAIN_MODEL.md
    // §1.4/§3). Índice parcial, não checagem em código — impossível de burlar mesmo
    // sob concorrência real (duas requisições simultâneas na mesma mesa).
    uniqueIndex('table_sessions_open_per_table_key')
      .on(t.tableId)
      .where(sql`${t.status} <> 'closed'`),
    tenantIsolationPolicy(t.tenantId),
  ],
).enableRLS();

export const tabs = pgTable(
  'tabs',
  {
    id: idColumn(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    tableSessionId: uuid('table_session_id')
      .notNull()
      .references(() => tableSessions.id, { onDelete: 'restrict' }),
    label: text('label').notNull(),
    status: text('status').notNull().default('open'),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    closedBy: uuid('closed_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [
    check('tabs_status_check', sql`${t.status} in ('open', 'closed')`),
    tenantIsolationPolicy(t.tenantId),
  ],
).enableRLS();

/**
 * `guests` fica SEM RLS por tenant, de propósito — mesmo caso de `devices`/
 * `pairing_codes` (ADR-025): resolver o cliente pelo token bruto do celular
 * (`X-Guest-Token`, análogo ao `X-Device-Token`) acontece ANTES de existir qualquer
 * contexto de tenant conhecido — é exatamente o problema que essas tabelas sem RLS
 * resolvem. `tenant_id`/`table_session_id` continuam `NOT NULL` (sabemos a qual tenant
 * um guest pertence assim que ele é resolvido); qualquer consulta de negócio depois de
 * resolvido volta a usar `withTenant()` normalmente. Endpoints que listam/filtram
 * guests por tenant fazem isso na aplicação, nunca confiando no banco para filtrar
 * sozinho aqui.
 */
export const guests = pgTable(
  'guests',
  {
    id: idColumn(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    tableSessionId: uuid('table_session_id')
      .notNull()
      .references(() => tableSessions.id, { onDelete: 'cascade' }),
    tabId: uuid('tab_id').references(() => tabs.id, { onDelete: 'set null' }),
    displayName: text('display_name'),
    // SHA-256 do token de sessão do celular do cliente — mesmo padrão de
    // `devices.tokenHash` (ADR-025/M3): alta entropia gerada por nós, hash rápido
    // apropriado (nunca argon2, que é só para segredo de baixa entropia como PIN).
    tokenHash: text('token_hash').notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex('guests_token_hash_key').on(t.tokenHash)],
);
