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
  /**
   * `apps/api` e `apps/web` rodam em origens diferentes de verdade (dois serviços
   * Railway em subdomínios `*.up.railway.app` distintos, sem domínio raiz comum —
   * `crossSubDomainCookies` do Better Auth não serve aqui, pediria `Domain` num
   * sufixo público). Sem isto, o cookie de sessão sai com `SameSite=Lax` e o
   * navegador nunca o reenvia nas chamadas cross-origin do `web` pro `api` — login
   * funciona (o Set-Cookie chega), mas toda chamada autenticada seguinte cai em 401
   * (bug real, achado testando login de verdade em produção, não só lendo o código).
   */
  crossOriginCookies?: boolean;
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
      ...(deps.crossOriginCookies
        ? { defaultCookieAttributes: { sameSite: 'none', secure: true } }
        : {}),
    },
    secret: deps.secret,
    trustedOrigins: deps.webOrigin ? [deps.webOrigin] : [],
  });
}

export type Auth = ReturnType<typeof createAuth>;
