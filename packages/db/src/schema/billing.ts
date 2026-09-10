import {
  bigint,
  boolean,
  check,
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
import { tabs } from './tables';

/**
 * Caixa e pagamentos (DOMAIN_MODEL.md §1.6, M13/M14). Tabelas de negócio normais: RLS
 * por tenant (ADR-021), sem exceção — diferente de `devices`/`guests` (ADR-025),
 * nenhuma delas precisa resolver identidade antes do tenant ser conhecido.
 *
 * **Escopo do M13**: um `cash_register` por tenant, provisionado no seed (mesmo padrão
 * de `tenant_settings`). **Escopo do M14**: `cashMovements` (sangria/suprimento —
 * `adjustment` reservado no `CHECK`, sem endpoint ainda, YAGNI) e `cashDivergences`
 * (gravada só quando `counted ≠ expected` no fechamento, nunca ajustada em silêncio).
 * `expected` por forma de pagamento é sempre derivado de `payments`+`cashMovements` sob
 * demanda — nunca armazenado à parte (ver correção de 2026-09-10 em `DOMAIN_MODEL.md §1.6`).
 */

export const cashRegisters = pgTable(
  'cash_registers',
  {
    id: idColumn(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (t) => [
    // Um registrador por (tenant, nome) — permite o seed provisionar "Caixa único" de
    // forma idempotente (`onConflictDoNothing`), mesmo padrão de `tables_tenant_id_label_key`.
    uniqueIndex('cash_registers_tenant_id_name_key').on(t.tenantId, t.name),
    tenantIsolationPolicy(t.tenantId),
  ],
).enableRLS();

export const cashSessions = pgTable(
  'cash_sessions',
  {
    id: idColumn(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    cashRegisterId: uuid('cash_register_id')
      .notNull()
      .references(() => cashRegisters.id, { onDelete: 'restrict' }),
    status: text('status').notNull().default('open'),
    openedBy: uuid('opened_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    openedAt: timestamp('opened_at', { withTimezone: true }).defaultNow().notNull(),
    openingFloatCents: bigint('opening_float_cents', { mode: 'number' }).notNull().default(0),
    closedBy: uuid('closed_by').references(() => users.id, { onDelete: 'set null' }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    check('cash_sessions_status_check', sql`${t.status} in ('open', 'closed')`),
    check('cash_sessions_opening_float_cents_check', sql`${t.openingFloatCents} >= 0`),
    // Invariante central do M13 (mesmo padrão de `table_sessions_open_per_table_key`,
    // M6): só uma sessão NÃO FECHADA por registradora, garantido pelo índice — nunca
    // por checagem em código, mesmo sob concorrência real.
    uniqueIndex('cash_sessions_open_per_register_key')
      .on(t.cashRegisterId)
      .where(sql`${t.status} <> 'closed'`),
    tenantIsolationPolicy(t.tenantId),
  ],
).enableRLS();

export const payments = pgTable(
  'payments',
  {
    id: idColumn(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    tabId: uuid('tab_id')
      .notNull()
      .references(() => tabs.id, { onDelete: 'restrict' }),
    cashSessionId: uuid('cash_session_id')
      .notNull()
      .references(() => cashSessions.id, { onDelete: 'restrict' }),
    method: text('method').notNull(),
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    tenderedCents: bigint('tendered_cents', { mode: 'number' }),
    changeCents: bigint('change_cents', { mode: 'number' }),
    status: text('status').notNull().default('confirmed'),
    receivedByUserId: uuid('received_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    idempotencyKey: text('idempotency_key').notNull(),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    voidReason: text('void_reason'),
    ...timestamps,
  },
  (t) => [
    check(
      'payments_method_check',
      sql`${t.method} in ('cash', 'debit', 'credit', 'pix', 'voucher', 'other')`,
    ),
    check('payments_status_check', sql`${t.status} in ('confirmed', 'voided')`),
    check('payments_amount_cents_check', sql`${t.amountCents} > 0`),
    tenantIsolationPolicy(t.tenantId),
  ],
).enableRLS();

export const cashMovements = pgTable(
  'cash_movements',
  {
    id: idColumn(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    cashSessionId: uuid('cash_session_id')
      .notNull()
      .references(() => cashSessions.id, { onDelete: 'restrict' }),
    type: text('type').notNull(),
    method: text('method').notNull(),
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    reason: text('reason').notNull(),
    byUserId: uuid('by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    ...timestamps,
  },
  (t) => [
    check('cash_movements_type_check', sql`${t.type} in ('withdrawal', 'deposit', 'adjustment')`),
    check(
      'cash_movements_method_check',
      sql`${t.method} in ('cash', 'debit', 'credit', 'pix', 'voucher', 'other')`,
    ),
    check('cash_movements_amount_cents_check', sql`${t.amountCents} > 0`),
    tenantIsolationPolicy(t.tenantId),
  ],
).enableRLS();

export const tabClosures = pgTable(
  'tab_closures',
  {
    id: idColumn(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    tabId: uuid('tab_id')
      .notNull()
      .references(() => tabs.id, { onDelete: 'restrict' }),
    itemsTotalCents: bigint('items_total_cents', { mode: 'number' }).notNull(),
    discountsCents: bigint('discounts_cents', { mode: 'number' }).notNull(),
    serviceFeeCents: bigint('service_fee_cents', { mode: 'number' }).notNull(),
    couvertCents: bigint('couvert_cents', { mode: 'number' }).notNull(),
    adjustmentsCents: bigint('adjustments_cents', { mode: 'number' }).notNull(),
    grandTotalCents: bigint('grand_total_cents', { mode: 'number' }).notNull(),
    paidTotalCents: bigint('paid_total_cents', { mode: 'number' }).notNull(),
    closedBy: uuid('closed_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    closedAt: timestamp('closed_at', { withTimezone: true }).defaultNow().notNull(),
    ...timestamps,
  },
  (t) => [
    // Nunca duas fotografias para a mesma comanda (M15, ACTIVE_PLAN.md #2) — o índice
    // único é o que torna `closeTab` idempotente por construção sem checagem em código.
    uniqueIndex('tab_closures_tab_id_key').on(t.tabId),
    tenantIsolationPolicy(t.tenantId),
  ],
).enableRLS();

export const cashDivergences = pgTable(
  'cash_divergences',
  {
    id: idColumn(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    cashSessionId: uuid('cash_session_id')
      .notNull()
      .references(() => cashSessions.id, { onDelete: 'restrict' }),
    method: text('method').notNull(),
    expectedCents: bigint('expected_cents', { mode: 'number' }).notNull(),
    countedCents: bigint('counted_cents', { mode: 'number' }).notNull(),
    differenceCents: bigint('difference_cents', { mode: 'number' }).notNull(),
    reason: text('reason'),
    acknowledgedBy: uuid('acknowledged_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    ...timestamps,
  },
  (t) => [
    check(
      'cash_divergences_method_check',
      sql`${t.method} in ('cash', 'debit', 'credit', 'pix', 'voucher', 'other')`,
    ),
    tenantIsolationPolicy(t.tenantId),
  ],
).enableRLS();
