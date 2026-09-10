import { bigint, check, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { idColumn, timestamps } from './_columns';
import { tenantIsolationPolicy } from './_rls';
import { tenants } from './platform';
import { users } from './identity';
import { tables, tableSessions, tabs } from './tables';
import { products, stations } from './catalog';

/**
 * Pedidos e produção (DOMAIN_MODEL.md §1.5, M8). Tabelas de negócio normais: RLS por
 * tenant (ADR-021), nada de exceção. **Escopo do M8** (ACTIVE_PLAN.md): sem
 * modificador no item (carrinho do M7 não tem — `modifiers_total_cents` sempre 0,
 * `selections`/`components` sempre nulos, prontos para quando a UI de modificador
 * existir); sem cancelamento (`cancelled_at`/`cancel_reason`/`cancel_stage`/
 * `charge_on_cancel` reservados, é M11); `sequence_number` é um contador simples por
 * tenant (não reseta por dia operacional ainda — depende de `tenant_settings.
 * business_day_cutoff`, entra quando um relatório diário real precisar disso, Fase D).
 */

export const orders = pgTable(
  'orders',
  {
    id: idColumn(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    tabId: uuid('tab_id')
      .notNull()
      .references(() => tabs.id, { onDelete: 'restrict' }),
    tableSessionId: uuid('table_session_id')
      .notNull()
      .references(() => tableSessions.id, { onDelete: 'restrict' }),
    tableId: uuid('table_id')
      .notNull()
      .references(() => tables.id, { onDelete: 'restrict' }),
    sequenceNumber: integer('sequence_number').notNull(),
    source: text('source').notNull(),
    status: text('status').notNull().default('submitted'),
    placedByGuestId: uuid('placed_by_guest_id'),
    placedByUserId: uuid('placed_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    idempotencyKey: text('idempotency_key').notNull(),
    notes: text('notes'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).defaultNow().notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    check('orders_source_check', sql`${t.source} in ('customer', 'staff', 'delivery')`),
    check(
      'orders_status_check',
      sql`${t.status} in ('submitted', 'accepted', 'in_production', 'ready', 'delivered', 'cancelled', 'rejected')`,
    ),
    tenantIsolationPolicy(t.tenantId),
  ],
).enableRLS();

export const orderItems = pgTable(
  'order_items',
  {
    id: idColumn(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    stationId: uuid('station_id')
      .notNull()
      .references(() => stations.id, { onDelete: 'restrict' }),
    nameSnapshot: text('name_snapshot').notNull(),
    unitPriceCents: bigint('unit_price_cents', { mode: 'number' }).notNull(),
    quantity: integer('quantity').notNull(),
    modifiersTotalCents: bigint('modifiers_total_cents', { mode: 'number' }).notNull().default(0),
    lineTotalCents: bigint('line_total_cents', { mode: 'number' }).notNull(),
    notes: text('notes'),
    status: text('status').notNull().default('queued'),
    selections: jsonb('selections'),
    ticketId: uuid('ticket_id'),
    ...timestamps,
  },
  (t) => [
    check(
      'order_items_status_check',
      sql`${t.status} in ('queued', 'preparing', 'ready', 'delivered', 'cancelled')`,
    ),
    check('order_items_quantity_check', sql`${t.quantity} > 0`),
    check('order_items_unit_price_cents_check', sql`${t.unitPriceCents} >= 0`),
    tenantIsolationPolicy(t.tenantId),
  ],
).enableRLS();

export const productionTickets = pgTable(
  'production_tickets',
  {
    id: idColumn(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    stationId: uuid('station_id')
      .notNull()
      .references(() => stations.id, { onDelete: 'restrict' }),
    status: text('status').notNull().default('queued'),
    queuedAt: timestamp('queued_at', { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    readyAt: timestamp('ready_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    recallCount: integer('recall_count').notNull().default(0),
    priority: integer('priority').notNull().default(0),
    ...timestamps,
  },
  (t) => [
    check(
      'production_tickets_status_check',
      sql`${t.status} in ('queued', 'preparing', 'ready', 'delivered', 'cancelled')`,
    ),
    tenantIsolationPolicy(t.tenantId),
  ],
).enableRLS();

export const orderEvents = pgTable(
  'order_events',
  {
    id: idColumn(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    orderItemId: uuid('order_item_id'),
    type: text('type').notNull(),
    fromStatus: text('from_status'),
    toStatus: text('to_status'),
    actor: jsonb('actor').notNull(),
    at: timestamp('at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [tenantIsolationPolicy(t.tenantId)],
).enableRLS();

/**
 * Ledger append-only (DOMAIN_MODEL.md §1.6). Escopo do M8: só o tipo `item_charge`
 * (cobrança de item no momento do pedido) — os demais tipos (`payment`, `discount`,
 * `service_fee`, etc.) entram na Fase D, quando existirem. Nunca UPDATE/DELETE
 * (revogado por convenção de aplicação; trigger de banco fica para quando o primeiro
 * caso de correção real aparecer).
 */
export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    id: idColumn(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    tabId: uuid('tab_id')
      .notNull()
      .references(() => tabs.id, { onDelete: 'restrict' }),
    type: text('type').notNull(),
    amountCents: bigint('amount_cents', { mode: 'number' }).notNull(),
    refType: text('ref_type'),
    refId: uuid('ref_id'),
    reason: text('reason'),
    createdBy: jsonb('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    check(
      'ledger_entries_type_check',
      sql`${t.type} in ('item_charge', 'item_reversal', 'service_fee', 'couvert', 'discount', 'payment', 'payment_void', 'adjustment', 'transfer_in', 'transfer_out')`,
    ),
    tenantIsolationPolicy(t.tenantId),
  ],
).enableRLS();
