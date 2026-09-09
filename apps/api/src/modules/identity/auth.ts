import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { betterAuth } from 'better-auth';
import type { Db } from '@bella/db';
import { schema } from '@bella/db';
import { newId } from '@bella/domain';

export interface AuthDeps {
  db: Db;
  secret: string | undefined;
  webOrigin: string | undefined;
  baseURL: string;
}

/**
 * Instância do Better Auth (M2, ADR-023). `usePlural: true` porque nosso schema segue a
 * convenção do projeto de nomes de tabela no plural (`users`, `sessions`, `accounts`,
 * `verifications` — DOMAIN_MODEL.md cabeçalho do §1), diferente do padrão singular do
 * Better Auth (`user`, `session`). `advanced.database.generateId` usa nosso gerador de
 * UUID v7 (ADR-019) em vez do id aleatório default, para todo `id` do banco seguir a
 * mesma convenção — as colunas continuam `uuid` nativo (packages/db/src/schema/auth.ts),
 * não `text`.
 *
 * Tabelas/colunas/config confirmadas rodando a própria CLI (`pnpm --filter @bella/api
 * auth:generate`) contra este arquivo, não escritas de memória (regra 12 do CLAUDE.md).
 */
export function createAuth(deps: AuthDeps) {
  return betterAuth({
    baseURL: deps.baseURL,
    database: drizzleAdapter(deps.db, {
      provider: 'pg',
      usePlural: true,
      schema,
    }),
    emailAndPassword: {
      enabled: true,
    },
    advanced: {
      database: {
        generateId: () => newId(),
      },
    },
    secret: deps.secret,
    trustedOrigins: deps.webOrigin ? [deps.webOrigin] : [],
  });
}

export type Auth = ReturnType<typeof createAuth>;
