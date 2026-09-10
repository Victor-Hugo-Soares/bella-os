import type { FastifyInstance } from 'fastify';
import type { z } from 'zod';
import type { Db } from '@bella/db';
import {
  applyDiscountSchema,
  cashMovementSchema,
  closeCashSessionSchema,
  createPaymentSchema,
  openCashSessionSchema,
  tabSplitQuerySchema,
  voidPaymentSchema,
} from '@bella/contracts';
import { AppError } from '../../lib/errors';
import type { Auth } from '../identity/auth';
import { requireAnySession, requirePermission } from '../identity/require-permission';
import {
  applyDiscount,
  closeCashSession,
  closeTab,
  getBill,
  getCurrentCashSession,
  getTabSplit,
  openCashSession,
  recordCashMovement,
  recordPayment,
  voidPayment,
} from './service';

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

function requireIdempotencyKey(request: { headers: Record<string, unknown> }): string {
  const header = request.headers['idempotency-key'];
  const key = Array.isArray(header) ? header[0] : header;
  if (!key || typeof key !== 'string') {
    throw new AppError('VALIDATION_ERROR', 'Cabeçalho Idempotency-Key é obrigatório.');
  }
  return key;
}

/**
 * Totais da comanda, desconto manual (M12) e caixa/pagamentos (M13, ACTIVE_PLAN.md —
 * crítico, dinheiro). `GET /bill` e `GET /cash-sessions/current` são leitura por
 * qualquer sessão de staff do tenant (Gate de Plano do M12 #6: nenhuma chave de
 * permissão cobre cashier+waiter+manager+owner ao mesmo tempo, e ler não é uma ação
 * sensível). `POST /discounts` exige `discounts.apply`; `POST /cash-sessions/open`
 * exige `cash.open`; `POST /payments` exige `payments.record`; `POST
 * /payments/:id/void` exige `payments.void`.
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

  app.post(
    '/v1/cash-sessions/open',
    { preHandler: requirePermission(db, auth, 'cash.open') },
    async (request, reply) => {
      const actor = request.actor!;
      const body = parseOrThrow(openCashSessionSchema, request.body);
      const session = await openCashSession(
        db,
        actor.tenantId,
        { type: 'user', userId: actor.userId },
        body,
      );
      reply.status(201);
      return { session };
    },
  );

  app.get(
    '/v1/cash-sessions/current',
    { preHandler: requireAnySession(db, auth) },
    async (request) => {
      const actor = request.actor!;
      const session = await getCurrentCashSession(db, actor.tenantId);
      return { session };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/v1/tabs/:id/payments',
    { preHandler: requirePermission(db, auth, 'payments.record') },
    async (request, reply) => {
      const actor = request.actor!;
      const body = parseOrThrow(createPaymentSchema, request.body);
      const idempotencyKey = requireIdempotencyKey(request);
      const result = await recordPayment(
        db,
        actor.tenantId,
        request.params.id,
        { type: 'user', userId: actor.userId },
        idempotencyKey,
        body,
      );
      reply.status(result.status);
      return { payment: result.body };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/v1/payments/:id/void',
    { preHandler: requirePermission(db, auth, 'payments.void') },
    async (request) => {
      const actor = request.actor!;
      const body = parseOrThrow(voidPaymentSchema, request.body);
      const payment = await voidPayment(
        db,
        actor.tenantId,
        request.params.id,
        { type: 'user', userId: actor.userId },
        body.reason,
      );
      return { payment };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/v1/cash-sessions/:id/movements',
    { preHandler: requirePermission(db, auth, 'cash.movement') },
    async (request, reply) => {
      const actor = request.actor!;
      const body = parseOrThrow(cashMovementSchema, request.body);
      const movement = await recordCashMovement(
        db,
        actor.tenantId,
        request.params.id,
        { type: 'user', userId: actor.userId },
        body,
      );
      reply.status(201);
      return { movement };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/v1/cash-sessions/:id/close',
    { preHandler: requirePermission(db, auth, 'cash.close') },
    async (request) => {
      const actor = request.actor!;
      const body = parseOrThrow(closeCashSessionSchema, request.body);
      const summary = await closeCashSession(
        db,
        actor.tenantId,
        request.params.id,
        { type: 'user', userId: actor.userId },
        body,
      );
      return { summary };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/v1/tabs/:id/close',
    { preHandler: requirePermission(db, auth, 'tabs.close') },
    async (request) => {
      const actor = request.actor!;
      const closure = await closeTab(db, actor.tenantId, request.params.id, {
        type: 'user',
        userId: actor.userId,
      });
      return { closure };
    },
  );

  app.get<{ Params: { id: string } }>(
    '/v1/tabs/:id/split',
    { preHandler: requireAnySession(db, auth) },
    async (request) => {
      const actor = request.actor!;
      const query = parseOrThrow(tabSplitQuerySchema, request.query);
      const split = await getTabSplit(db, actor.tenantId, request.params.id, query.parts);
      return { split };
    },
  );
}
