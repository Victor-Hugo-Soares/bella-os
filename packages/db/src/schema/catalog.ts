import {
  bigint,
  boolean,
  check,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { idColumn, timestamps } from './_columns';
import { tenantIsolationPolicy } from './_rls';
import { tenants } from './platform';

/**
 * Catálogo (DOMAIN_MODEL.md §1.3, M5). Tabelas de negócio normais: `tenant_id` +
 * RLS igual a `roles`/`memberships` (ADR-021) — nenhuma exceção como `devices`
 * (ADR-025), porque aqui sempre há um tenant conhecido no contexto da requisição
 * (a rota exige `catalog.manage`, que já passou por `resolveActor`/tenant).
 *
 * Escopo do M5 (ACTIVE_PLAN.md): sem `product_images` (upload/storage é problema à
 * parte) e sem `pizza_flavor_groups` (depende de `modifier_groups` já existir e de
 * decisão de produto sobre precificação de meio a meio) — reservados para depois,
 * não modelados ainda.
 */

export const stations = pgTable(
  'stations',
  {
    id: idColumn(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    kind: text('kind').notNull().default('kitchen'),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('stations_tenant_id_name_key').on(t.tenantId, t.name),
    check('stations_kind_check', sql`${t.kind} in ('kitchen', 'pizza', 'bar', 'other')`),
    tenantIsolationPolicy(t.tenantId),
  ],
).enableRLS();

export const categories = pgTable(
  'categories',
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
    uniqueIndex('categories_tenant_id_name_key').on(t.tenantId, t.name),
    tenantIsolationPolicy(t.tenantId),
  ],
).enableRLS();

export const products = pgTable(
  'products',
  {
    id: idColumn(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),
    stationId: uuid('station_id')
      .notNull()
      .references(() => stations.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    description: text('description'),
    basePriceCents: bigint('base_price_cents', { mode: 'number' }).notNull(),
    kind: text('kind').notNull().default('simple'),
    isActive: boolean('is_active').notNull().default(true),
    isAvailable: boolean('is_available').notNull().default(true),
    prepTimeMinutes: integer('prep_time_minutes'),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (t) => [
    check('products_kind_check', sql`${t.kind} in ('simple', 'pizza')`),
    check('products_base_price_cents_check', sql`${t.basePriceCents} >= 0`),
    tenantIsolationPolicy(t.tenantId),
  ],
).enableRLS();

export const modifierGroups = pgTable(
  'modifier_groups',
  {
    id: idColumn(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    minSelect: integer('min_select').notNull().default(0),
    maxSelect: integer('max_select').notNull().default(1),
    pricingMode: text('pricing_mode').notNull().default('delta'),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (t) => [
    check('modifier_groups_pricing_mode_check', sql`${t.pricingMode} in ('delta', 'absolute')`),
    check(
      'modifier_groups_select_check',
      sql`${t.minSelect} >= 0 and ${t.maxSelect} >= ${t.minSelect}`,
    ),
    tenantIsolationPolicy(t.tenantId),
  ],
).enableRLS();

export const modifiers = pgTable(
  'modifiers',
  {
    id: idColumn(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    groupId: uuid('group_id')
      .notNull()
      .references(() => modifierGroups.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    priceCents: bigint('price_cents', { mode: 'number' }).notNull().default(0),
    isAvailable: boolean('is_available').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (t) => [tenantIsolationPolicy(t.tenantId)],
).enableRLS();

export const productModifierGroups = pgTable(
  'product_modifier_groups',
  {
    id: idColumn(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    groupId: uuid('group_id')
      .notNull()
      .references(() => modifierGroups.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('product_modifier_groups_product_id_group_id_key').on(t.productId, t.groupId),
    tenantIsolationPolicy(t.tenantId),
  ],
).enableRLS();
