import { timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Colunas repetidas em toda tabela (DOMAIN_MODEL.md, cabeçalho do §1).
 * `id` usa gen_random_uuid() como default de banco (fallback); a aplicação normalmente
 * gera o UUID v7 antes do insert via @bella/domain newId() — ver ADR-019.
 */
export const idColumn = () => uuid('id').defaultRandom().primaryKey();

/**
 * Chaves do objeto em camelCase (`createdAt`/`updatedAt`), consistente com o resto do
 * schema (`tenantId`, `roleId`, ...) — a coluna SQL continua `created_at`/`updated_at`.
 * Isto importa de verdade: o adapter do Better Auth (M2) procura campos pela chave JS
 * camelCase; uma chave `created_at` (descoberta ao integrar auth.ts) não seria
 * encontrada. Renomear a chave aqui não gera migration — o drizzle-kit identifica a
 * coluna pelo nome SQL (`created_at`), não pela chave do objeto TS (conferido no
 * snapshot: `columns['created_at'].name === 'created_at'`).
 */
export const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
};
