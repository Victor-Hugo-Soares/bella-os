import { timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Colunas repetidas em toda tabela (DOMAIN_MODEL.md, cabeçalho do §1).
 * `id` usa gen_random_uuid() como default de banco (fallback); a aplicação normalmente
 * gera o UUID v7 antes do insert via @bella/domain newId() — ver ADR-019.
 */
export const idColumn = () => uuid('id').defaultRandom().primaryKey();

export const timestamps = {
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
};
