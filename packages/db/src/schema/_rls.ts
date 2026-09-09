import { sql, type SQL } from 'drizzle-orm';
import { pgPolicy, pgRole, type PgColumn } from 'drizzle-orm/pg-core';

/**
 * Papel de aplicação (ADR-004, migration gerada por este schema): sem LOGIN, sem
 * SUPERUSER, sem BYPASSRLS, sem CREATEDB/CREATEROLE — todos defaults do Postgres para
 * `CREATE ROLE` quando nenhuma dessas opções é pedida. `inherit: true` é passado
 * explicitamente para gerar exatamente `CREATE ROLE "bella_app";` sem cláusula WITH
 * (o construtor do drizzle-orm não tem default para `inherit`; deixar `undefined`
 * geraria `WITH NOINHERIT` sem necessidade — conferido no código-fonte instalado).
 * Login/senha são configurados fora de qualquer migration — ver set-app-role-password.ts.
 */
export const bellaAppRole = pgRole('bella_app', { inherit: true });

/**
 * Política de RLS padrão do projeto: uma linha só é visível/gravável quando seu
 * `tenant_id` bate com `app.tenant_id` da sessão (definido por withTenant/withoutTenant).
 * `nullif(..., '')` trata "sem contexto" e "contexto vazio" da mesma forma seguras
 * (zero linhas), sem deixar o cast a ''::uuid explodir em erro (DOMAIN_MODEL.md §3).
 */
export function tenantIsolationPolicy(tenantIdColumn: PgColumn) {
  const check: SQL = sql`${tenantIdColumn} = nullif(current_setting('app.tenant_id', true), '')::uuid`;
  return pgPolicy('tenant_isolation', {
    as: 'permissive',
    for: 'all',
    to: bellaAppRole,
    using: check,
    withCheck: check,
  });
}
