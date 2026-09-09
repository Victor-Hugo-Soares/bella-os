import {
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { idColumn, timestamps } from './_columns';
import { tenants } from './platform';

/**
 * Dispositivos e códigos de pareamento (M3, DOMAIN_MODEL.md §1.2). **Sem RLS por
 * tenant, de propósito** (ADR-025) — diferente de `roles`/`memberships`/etc: o
 * bootstrap de autenticação de dispositivo (achar QUAL device pelo token bruto, achar
 * QUAL pairing code pelos 6 dígitos) acontece ANTES de existir qualquer contexto de
 * tenant — é exatamente o mesmo motivo pelo qual `users`/`sessions` também são
 * globais. Uma vez resolvido o dispositivo, toda query de negócio que ele fizer entra
 * em `withTenant(db, device.tenantId, ...)` normalmente. Endpoints administrativos
 * (listar/revogar) filtram `tenant_id` explicitamente na aplicação, já que o banco não
 * filtra sozinho aqui.
 *
 * `station_ids`/`cash_register_id` referenciam tabelas que ainda não existem
 * (`stations` é M5, `cash_registers` é M13) — guardados sem FK por enquanto, como
 * reserva de campo (mesmo padrão do M1 para `charge_on_cancel` etc.).
 */

export const devices = pgTable(
  'devices',
  {
    id: idColumn(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    kind: text('kind').notNull(),
    // SHA-256 do token (determinístico, permite busca direta `WHERE token_hash = $1`).
    // Diferente do PIN: o token tem alta entropia (gerado por nós), então um hash
    // rápido é apropriado — argon2 (lento, para segredo de baixa entropia) é usado
    // só para o PIN humano, nunca para este token. Ver pin.ts.
    tokenHash: text('token_hash').notNull(),
    stationIds: jsonb('station_ids'),
    cashRegisterId: uuid('cash_register_id'),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('devices_token_hash_key').on(t.tokenHash),
    index('devices_tenant_id_idx').on(t.tenantId),
    check('devices_kind_check', sql`${t.kind} in ('kds', 'cashier', 'floor', 'admin')`),
  ],
);

export const pairingCodes = pgTable(
  'pairing_codes',
  {
    id: idColumn(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    deviceKind: text('device_kind').notNull(),
    deviceName: text('device_name').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdByMembershipId: uuid('created_by_membership_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // Nenhum código NÃO CONSUMIDO pode colidir com outro em qualquer tenant — o
    // predicado de índice parcial não pode usar now() (não é IMMUTABLE), então
    // códigos expirados-mas-não-consumidos contam até serem limpos (Fase E); a
    // colisão é rara (espaço de 1.000.000 códigos) e resolvida por retry na geração.
    uniqueIndex('pairing_codes_code_key')
      .on(t.code)
      .where(sql`${t.usedAt} is null`),
    index('pairing_codes_tenant_id_idx').on(t.tenantId),
    check(
      'pairing_codes_device_kind_check',
      sql`${t.deviceKind} in ('kds', 'cashier', 'floor', 'admin')`,
    ),
  ],
);
