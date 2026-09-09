import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { idColumn } from './_columns';
import { users } from './identity';

/**
 * Tabelas exigidas pelo Better Auth (M2, ADR-023). Nomes/colunas confirmados rodando a
 * própria CLI (`pnpm --filter @bella/api auth:generate`) contra `identity/auth.ts` —
 * não escritos de memória. Adaptado ao estilo do projeto: `uuid` em vez de `text` para
 * IDs (Better Auth gera o valor via `advanced.database.generateId`, usando
 * `@bella/domain newId()` — UUID v7, ADR-019), chaves de objeto em camelCase.
 * Globais como `users` — sem `tenant_id`, sem RLS por tenant.
 */

export const sessions = pgTable(
  'sessions',
  {
    id: idColumn(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (t) => [
    uniqueIndex('sessions_token_key').on(t.token),
    index('sessions_user_id_idx').on(t.userId),
  ],
);

export const accounts = pgTable(
  'accounts',
  {
    id: idColumn(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    // Senha do login local (email+senha) mora aqui, não em `users` — é assim que o
    // Better Auth modela "conta" (uma linha por método de login).
    password: text('password'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index('accounts_user_id_idx').on(t.userId)],
);

export const verifications = pgTable(
  'verifications',
  {
    id: idColumn(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index('verifications_identifier_idx').on(t.identifier)],
);

export const usersAuthRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  accounts: many(accounts),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));
