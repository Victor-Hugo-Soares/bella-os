import { sql } from 'drizzle-orm';
import type { Db } from './client';

/** Transação Drizzle (mesma interface de query do Db). */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Executa `fn` dentro de uma transação com `app.tenant_id` definido via set_config local.
 * É a base da segunda camada de isolamento (RLS, ADR-004): as policies leem
 * current_setting('app.tenant_id'). Fora desta função, nenhuma query de negócio deve rodar.
 */
export async function withTenant<T>(
  db: Db,
  tenantId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  if (!UUID_RE.test(tenantId)) throw new Error('tenantId inválido: esperado UUID');
  return db.transaction(async (tx) => {
    // set_config(..., true) = escopo da transação (equivalente a SET LOCAL), parametrizado.
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
    return fn(tx);
  });
}

/** Lê o tenant corrente da sessão SQL (útil em testes e diagnósticos). */
export async function currentTenantId(tx: Tx | Db): Promise<string | null> {
  const result = await tx.execute<{ tenant: string | null }>(
    sql`select nullif(current_setting('app.tenant_id', true), '') as tenant`,
  );
  return result.rows[0]?.tenant ?? null;
}

/**
 * Executa `fn` numa transação DELIBERADAMENTE sem `app.tenant_id` — para operações de
 * plataforma que legitimamente cruzam tenants (criar um tenant novo, listar tenants como
 * superadmin). Só serve para tabelas globais/sem RLS (organizations, tenants, users,
 * platform_admins): tabelas com RLS por tenant não devolvem nenhuma linha sem contexto
 * (ver DOMAIN_MODEL.md §3 "sem contexto, nenhuma linha visível"), então usar isto para
 * uma tabela de negócio simplesmente não funciona — não é uma forma de contornar RLS.
 * Existe como marcador explícito no código: quem lê a chamada sabe que é intencional.
 */
export async function withoutTenant<T>(db: Db, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', '', true)`);
    return fn(tx);
  });
}

/**
 * Executa `fn` numa transação com `app.user_id` definido (sem `app.tenant_id`) — só serve
 * para tabelas que declararam explicitamente uma policy de autoconsulta por usuário
 * (ex.: `memberships`, ver `schema/identity.ts`). Resolve um problema legítimo: descobrir
 * a QUAL tenant um usuário pertence (`GET /v1/me/tenants`, M5) sem ainda ter nenhum
 * `X-Tenant-Id` — `withoutTenant` não serve aqui porque `memberships` tem RLS por tenant
 * (sem contexto, zero linhas). Não é bypass de RLS: só enxerga as próprias linhas do
 * usuário, via uma segunda policy permissiva (`self_membership_lookup`) que o Postgres
 * combina com OR à policy de tenant — nunca substitui isolamento entre tenants.
 */
export async function withUser<T>(db: Db, userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!UUID_RE.test(userId)) throw new Error('userId inválido: esperado UUID');
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', '', true)`);
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
    return fn(tx);
  });
}
