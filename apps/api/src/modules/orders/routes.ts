import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Db } from '@bella/db';
import { schema, withTenant } from '@bella/db';
import { createOrderSchema } from '@bella/contracts';
import { AppError } from '../../lib/errors';
import { parseCookies } from '../../lib/cookies';
import type { Auth } from '../identity/auth';
import { requirePermission } from '../identity/require-permission';
import { GUEST_SESSION_COOKIE } from '../tables/routes';
import { resolveGuestActor } from '../tables/service';
import { createOrder } from './service';

export interface OrderRoutesDeps {
  db: Db;
  auth: Auth;
}

function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AppError('VALIDATION_ERROR', result.error.issues.map((i) => i.message).join('; '));
  }
  return result.data;
}

function requireIdempotencyKey(request: { headers: Record<string, unknown> }): string {
  const header = request.headers['idempotency-key'];
  const key = Array.isArray(header) ? header[0] : header;
  if (!key || typeof key !== 'string') {
    throw new AppError('VALIDATION_ERROR', 'Cabeçalho Idempotency-Key é obrigatório.');
  }
  return key;
}

async function findTableIdForSession(
  db: Db,
  tenantId: string,
  tableSessionId: string,
): Promise<string> {
  const rows = await withTenant(db, tenantId, (tx) =>
    tx
      .select({ tableId: schema.tableSessions.tableId })
      .from(schema.tableSessions)
      .where(
        and(
          eq(schema.tableSessions.id, tableSessionId),
          eq(schema.tableSessions.tenantId, tenantId),
        ),
      ),
  );
  const row = rows[0];
  if (!row) throw new AppError('NOT_FOUND', 'Sessão de mesa não encontrada.');
  return row.tableId;
}

/**
 * Criação de pedido (M8, ACTIVE_PLAN.md — crítico). Dois caminhos de autenticação
 * convergem no mesmo `createOrder()`: cliente via cookie de sessão de mesa (M6, sem
 * sessão de staff) e staff via `orders.create.on_behalf_of_table` (sessão normal +
 * `tabId` explícito no corpo). `Idempotency-Key` obrigatória nos dois.
 */
export async function orderRoutes(app: FastifyInstance, deps: OrderRoutesDeps): Promise<void> {
  const { db, auth } = deps;

  app.post('/public/:tenantSlug/orders', async (request, reply) => {
    const cookies = parseCookies(request.headers.cookie);
    const guest = await resolveGuestActor(db, cookies[GUEST_SESSION_COOKIE]);
    if (!guest.tabId) {
      throw new AppError('NOT_FOUND', 'Nenhuma comanda associada a esta sessão de mesa.');
    }
    const body = parseOrThrow(createOrderSchema, request.body);
    const idempotencyKey = requireIdempotencyKey(request);
    const tableId = await findTableIdForSession(db, guest.tenantId, guest.tableSessionId);

    const result = await createOrder(
      db,
      {
        tenantId: guest.tenantId,
        tabId: guest.tabId,
        tableSessionId: guest.tableSessionId,
        tableId,
        source: 'customer',
        actor: { type: 'guest', guestId: guest.guestId },
      },
      idempotencyKey,
      body,
    );
    reply.status(result.status);
    return result.body;
  });

  const staffCreateOrderSchema = createOrderSchema.extend({ tabId: z.uuid() });
  app.post(
    '/v1/orders',
    { preHandler: requirePermission(db, auth, 'orders.create') },
    async (request, reply) => {
      const body = parseOrThrow(staffCreateOrderSchema, request.body);
      const idempotencyKey = requireIdempotencyKey(request);
      const actor = request.actor!;

      const [tab] = await withTenant(db, actor.tenantId, (tx) =>
        tx
          .select()
          .from(schema.tabs)
          .where(and(eq(schema.tabs.id, body.tabId), eq(schema.tabs.tenantId, actor.tenantId))),
      );
      if (!tab) throw new AppError('NOT_FOUND', 'Comanda não encontrada.');
      const tableId = await findTableIdForSession(db, actor.tenantId, tab.tableSessionId);

      const result = await createOrder(
        db,
        {
          tenantId: actor.tenantId,
          tabId: body.tabId,
          tableSessionId: tab.tableSessionId,
          tableId,
          source: 'staff',
          actor: { type: 'user', userId: actor.userId },
        },
        idempotencyKey,
        body,
      );
      reply.status(result.status);
      return result.body;
    },
  );
}
