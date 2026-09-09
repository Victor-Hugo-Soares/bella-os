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
