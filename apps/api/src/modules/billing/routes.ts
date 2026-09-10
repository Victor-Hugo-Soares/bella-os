import type { FastifyInstance } from 'fastify';
import type { z } from 'zod';
import type { Db } from '@bella/db';
import { applyDiscountSchema } from '@bella/contracts';
import { AppError } from '../../lib/errors';
import type { Auth } from '../identity/auth';
import { requireAnySession, requirePermission } from '../identity/require-permission';
import { applyDiscount, getBill } from './service';

export interface BillingRoutesDeps {
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

/**
 * Totais da comanda e desconto manual (M12, ACTIVE_PLAN.md — crítico, dinheiro).
 * `GET /bill` é leitura por qualquer sessão de staff do tenant (Gate de Plano #6: não
 * há chave de permissão que cubra cashier+waiter+manager+owner ao mesmo tempo, e ver o
 * total não é uma ação sensível como desconto/pagamento/cancelamento). `POST
 * /discounts` exige `discounts.apply`.
 */
export async function billingRoutes(app: FastifyInstance, deps: BillingRoutesDeps): Promise<void> {
  const { db, auth } = deps;

  app.get<{ Params: { id: string } }>(
    '/v1/tabs/:id/bill',
    { preHandler: requireAnySession(db, auth) },
    async (request) => {
      const actor = request.actor!;
      const bill = await getBill(db, actor.tenantId, request.params.id);
      return { bill };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/v1/tabs/:id/discounts',
    { preHandler: requirePermission(db, auth, 'discounts.apply') },
    async (request, reply) => {
      const actor = request.actor!;
      const body = parseOrThrow(applyDiscountSchema, request.body);
      const discount = await applyDiscount(
        db,
        actor.tenantId,
        request.params.id,
        { type: 'user', userId: actor.userId },
        body,
      );
      reply.status(201);
      return { discount };
    },
  );
}
