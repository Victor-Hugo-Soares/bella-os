import { eq } from 'drizzle-orm';
import type { Db } from '@bella/db';
import { schema, withoutTenant } from '@bella/db';
import { AppError } from './errors';

/**
 * Resolve o tenant pelo slug (tabela global `tenants`, sem RLS — ARCHITECTURE.md §4)
 * ANTES de qualquer `withTenant()`. Usado por toda rota `/public/*` que recebe o tenant
 * pela URL (sessão de mesa no M6, catálogo público no M7). `notFoundMessage` deixa cada
 * chamador escolher uma mensagem genérica que não vaza se o slug existe ou não.
 */
export async function resolveTenantBySlug(
  db: Db,
  tenantSlug: string,
  notFoundMessage: string,
): Promise<string> {
  const rows = await withoutTenant(db, (tx) =>
    tx
      .select({ id: schema.tenants.id })
      .from(schema.tenants)
      .where(eq(schema.tenants.slug, tenantSlug)),
  );
  const tenant = rows[0];
  if (!tenant) throw new AppError('NOT_FOUND', notFoundMessage);
  return tenant.id;
}
