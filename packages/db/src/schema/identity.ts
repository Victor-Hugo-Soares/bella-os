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
import { selfLookupPolicy, tenantIsolationPolicy } from './_rls';
import { tenants } from './platform';

/**
 * Identidade (DOMAIN_MODEL.md §1.2). `users` é global (sem RLS por tenant); todas as
 * demais tabelas deste arquivo têm. `email_verified` e `image` são campos que o Better
 * Auth (M2, ADR-023) espera encontrar — nomes/tipos confirmados rodando a própria CLI
 * (`auth generate`) contra este schema, não adivinhados. A senha do login local mora em
 * `accounts.password` (schema/auth.ts), não aqui — é assim que o Better Auth modela
 * "conta" (uma linha por método de login); o `password_hash` do M1 nunca chegou a ser
 * usado por código nenhum e foi removido para não haver dois lugares para a senha.
 */
export const users = pgTable(
  'users',
  {
    id: idColumn(),
    email: text('email').notNull(),
    name: text('name').notNull(),
    emailVerified: boolean('email_verified').notNull().default(false),
    image: text('image'),
    status: text('status').notNull().default('active'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('users_email_key').on(t.email),
    check('users_status_check', sql`${t.status} in ('active', 'disabled')`),
  ],
);

export const roles = pgTable(
  'roles',
  {
    id: idColumn(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    isSystem: boolean('is_system').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('roles_tenant_id_name_key').on(t.tenantId, t.name),
    tenantIsolationPolicy(t.tenantId),
  ],
).enableRLS();

export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    // Denormalizado a partir de roles.tenant_id de propósito: mantém a política de RLS
    // uniforme (`tenant_id = current_setting(...)`) em toda tabela, sem policy por subquery.
    // Preenchido pelo serviço a partir do tenant do papel, nunca digitado pelo cliente.
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    permissionKey: text('permission_key').notNull(),
  },
  (t) => [
    uniqueIndex('role_permissions_role_id_permission_key_key').on(t.roleId, t.permissionKey),
    tenantIsolationPolicy(t.tenantId),
  ],
).enableRLS();

export const memberships = pgTable(
  'memberships',
  {
    id: idColumn(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'restrict' }),
    pinHash: text('pin_hash'),
    pinFailedAttempts: integer('pin_failed_attempts').notNull().default(0),
    pinLockedUntil: timestamp('pin_locked_until', { withTimezone: true }),
    status: text('status').notNull().default('active'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('memberships_user_id_tenant_id_key').on(t.userId, t.tenantId),
    check('memberships_status_check', sql`${t.status} in ('active', 'disabled')`),
    tenantIsolationPolicy(t.tenantId),
    selfLookupPolicy(t.userId),
  ],
).enableRLS();
