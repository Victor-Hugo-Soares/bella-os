import type { FastifyReply, FastifyRequest } from 'fastify';
import { fromNodeHeaders } from 'better-auth/node';
import { and, eq } from 'drizzle-orm';
import type { Db } from '@bella/db';
import { schema, withTenant } from '@bella/db';
import { isUuid, isPermissionKey, type PermissionKey } from '@bella/domain';
import { AppError } from '../../lib/errors';
import type { Auth } from './auth';

/**
 * Ator autenticado de uma requisição, já resolvido para um tenant específico
 * (ARCHITECTURE.md §5: `{ type, id, tenantId, permissions }`). Um usuário pode ter
 * membership em vários tenants (ex.: dono de duas unidades no futuro); o tenant ativo
 * da requisição vem do header `X-Tenant-Id` — a UI decide isso mais adiante (Fase B),
 * mas a API já valida/isola por tenant desde o M2.
 */
export interface RequestActor {
  type: 'user';
  userId: string;
  tenantId: string;
  membershipId: string;
  roleId: string;
  permissions: PermissionKey[];
}

declare module 'fastify' {
  interface FastifyRequest {
    actor?: RequestActor;
  }
}

const TENANT_HEADER = 'x-tenant-id';

/**
 * Resolve sessão (Better Auth) + membership + permissões efetivas do papel, tudo
 * dentro do contexto RLS do tenant informado — nunca fora dele (DOMAIN_MODEL.md §3).
 * Lança AppError com o código certo em cada falha; nunca deixa passar sem checar.
 */
export async function resolveActor(
  request: FastifyRequest,
  db: Db,
  auth: Auth,
): Promise<RequestActor> {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
  if (!session) {
    throw new AppError('UNAUTHENTICATED', 'Sessão inválida ou expirada.');
  }

  const tenantHeader = request.headers[TENANT_HEADER];
  const tenantId = Array.isArray(tenantHeader) ? tenantHeader[0] : tenantHeader;
  if (!tenantId || !isUuid(tenantId)) {
    throw new AppError('TENANT_MISMATCH', `Cabeçalho ${TENANT_HEADER} ausente ou inválido.`);
  }

  const userId = session.user.id;

  const rows = await withTenant(db, tenantId, (tx) =>
    tx
      .select({
        membershipId: schema.memberships.id,
        roleId: schema.memberships.roleId,
        status: schema.memberships.status,
        permissionKey: schema.rolePermissions.permissionKey,
      })
      .from(schema.memberships)
      .innerJoin(
        schema.rolePermissions,
        eq(schema.rolePermissions.roleId, schema.memberships.roleId),
      )
      .where(and(eq(schema.memberships.userId, userId), eq(schema.memberships.tenantId, tenantId))),
  );

  const membership = rows[0];
  if (!membership || membership.status !== 'active') {
    // Mesma resposta para "não existe" e "existe mas está desativado": não vazamos
    // para o cliente se o tenant existe ou se o usuário tem alguma relação com ele.
    throw new AppError('TENANT_MISMATCH', 'Usuário sem acesso ativo a este tenant.');
  }

  const permissions = rows.map((r) => r.permissionKey).filter(isPermissionKey);

  return {
    type: 'user',
    userId,
    tenantId,
    membershipId: membership.membershipId,
    roleId: membership.roleId,
    permissions,
  };
}

/**
 * Fábrica do middleware de permissão. Uso: `{ preHandler: requirePermission(db, auth,
 * 'orders.create') }` numa rota. 401 sem sessão, 403 (TENANT_MISMATCH) sem membership
 * ativo no tenant do header, 403 (PERMISSION_DENIED) com membership mas sem a chave.
 */
export function requirePermission(db: Db, auth: Auth, key: PermissionKey) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const actor = await resolveActor(request, db, auth);
    if (!actor.permissions.includes(key)) {
      throw new AppError('PERMISSION_DENIED', `Permissão necessária: ${key}.`);
    }
    request.actor = actor;
  };
}
