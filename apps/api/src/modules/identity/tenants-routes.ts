import type { FastifyInstance } from 'fastify';
import { fromNodeHeaders } from 'better-auth/node';
import { and, eq } from 'drizzle-orm';
import type { Db } from '@bella/db';
import { schema, withUser } from '@bella/db';
import { AppError } from '../../lib/errors';
import type { Auth } from './auth';

export interface TenantsRoutesDeps {
  db: Db;
  auth: Auth;
}

/**
 * `GET /v1/me/tenants`: tenants onde o usuário logado tem membership ativa. Usa
 * `withUser()` (não `withoutTenant`) — `memberships` tem RLS por tenant; sem contexto
 * nenhuma linha apareceria (DOMAIN_MODEL.md §3). `withUser` ativa a policy de
 * autoconsulta (`selfLookupPolicy`, ADR-030): só as próprias membership do usuário, não
 * um bypass de isolamento entre tenants. `tenants` não tem RLS (é global, ARCHITECTURE.md
 * §4), então o JOIN funciona no mesmo contexto.
 *
 * Escopo do M5 (ACTIVE_PLAN.md): sem seletor de tenant na UI ainda — o front usa o
 * primeiro resultado. Suficiente para um usuário com um tenant só (o caso real do Bella
 * III agora); múltiplos tenants por usuário é produto de Fase G (SaaS).
 */
export async function tenantsRoutes(app: FastifyInstance, deps: TenantsRoutesDeps): Promise<void> {
  const { db, auth } = deps;

  app.get('/v1/me/tenants', async (request) => {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) {
      throw new AppError('UNAUTHENTICATED', 'Sessão inválida ou expirada.');
    }

    const rows = await withUser(db, session.user.id, (tx) =>
      tx
        .select({
          id: schema.tenants.id,
          slug: schema.tenants.slug,
          name: schema.tenants.name,
        })
        .from(schema.memberships)
        .innerJoin(schema.tenants, eq(schema.tenants.id, schema.memberships.tenantId))
        .where(
          and(
            eq(schema.memberships.userId, session.user.id),
            eq(schema.memberships.status, 'active'),
          ),
        ),
    );

    return { tenants: rows };
  });
}
