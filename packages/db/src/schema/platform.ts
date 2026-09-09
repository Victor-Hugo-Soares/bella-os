import {
  bigint,
  boolean,
  check,
  jsonb,
  pgTable,
  text,
  time,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { idColumn, timestamps } from './_columns';
import { tenantIsolationPolicy } from './_rls';

/**
 * Tabelas de plataforma e tenant (DOMAIN_MODEL.md §1.1). `organizations`, `tenants` e
 * `platform_admins` ficam SEM RLS por tenant de propósito — são as tabelas que DEFINEM
 * o que é um tenant, ou são globais/de plataforma (ARCHITECTURE.md §4).
 */

export const organizations = pgTable('organizations', {
  id: idColumn(),
  name: text('name').notNull(),
  ...timestamps,
});

export const tenants = pgTable(
  'tenants',
  {
    id: idColumn(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    organizationId: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'restrict',
    }),
    timezone: text('timezone').notNull().default('America/Sao_Paulo'),
    status: text('status').notNull().default('active'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('tenants_slug_key').on(t.slug),
    check('tenants_status_check', sql`${t.status} in ('active', 'suspended')`),
  ],
);

/**
 * Configurações tipadas por tenant (DOMAIN_MODEL.md §1.1). `tenant_id` é a própria PK:
 * uma linha por tenant, sempre existe (criada junto com o tenant — ver seed).
 */
export const tenantSettings = pgTable(
  'tenant_settings',
  {
    tenantId: uuid('tenant_id')
      .primaryKey()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    serviceFeeBps: bigint('service_fee_bps', { mode: 'number' }).notNull().default(1000),
    serviceFeeMode: text('service_fee_mode').notNull().default('optional'),
    couvertCents: bigint('couvert_cents', { mode: 'number' }).notNull().default(0),
    couvertMode: text('couvert_mode').notNull().default('off'),
    customerOrderMode: text('customer_order_mode').notNull().default('confirm_first_order'),
    halfHalfPricing: text('half_half_pricing').notNull().default('highest'),
    businessDayCutoff: time('business_day_cutoff').notNull().default('05:00:00'),
    customerCanRequestBill: boolean('customer_can_request_bill').notNull().default(true),
    unverifiedSessionMaxCents: bigint('unverified_session_max_cents', { mode: 'number' })
      .notNull()
      .default(5000),
    brand: jsonb('brand').notNull().default({}),
    ...timestamps,
  },
  (t) => [
    check(
      'tenant_settings_service_fee_mode_check',
      sql`${t.serviceFeeMode} in ('off', 'optional', 'mandatory')`,
    ),
    check(
      'tenant_settings_couvert_mode_check',
      sql`${t.couvertMode} in ('off', 'per_guest', 'per_tab')`,
    ),
    check(
      'tenant_settings_customer_order_mode_check',
      sql`${t.customerOrderMode} in ('direct', 'confirm_first_order', 'confirm_all')`,
    ),
    check(
      'tenant_settings_half_half_pricing_check',
      sql`${t.halfHalfPricing} in ('highest', 'average')`,
    ),
    check(
      'tenant_settings_service_fee_bps_check',
      sql`${t.serviceFeeBps} >= 0 and ${t.serviceFeeBps} <= 10000`,
    ),
    check('tenant_settings_couvert_cents_check', sql`${t.couvertCents} >= 0`),
    tenantIsolationPolicy(t.tenantId),
  ],
).enableRLS();

/** Superadmin de plataforma — separado de membership (DOMAIN_MODEL.md §1.2). */
export const platformAdmins = pgTable('platform_admins', {
  userId: uuid('user_id').primaryKey(),
  ...timestamps,
});
