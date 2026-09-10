import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '@bella/db';
import { schema, withTenant } from '@bella/db';
import { newId } from '@bella/domain';
import type { CreateOrderInput } from '@bella/contracts';
import { AppError } from '../../lib/errors';
import { withIdempotency } from '../../lib/idempotency';

export type OrderActor =
  | { type: 'user'; userId: string }
  | { type: 'guest'; guestId: string }
  | { type: 'device'; deviceId: string };

export interface OrderContext {
  tenantId: string;
  tabId: string;
  tableSessionId: string;
  tableId: string;
  source: 'customer' | 'staff' | 'delivery';
  actor: OrderActor;
}

export interface CreateOrderResult {
  order: {
    id: string;
    sequenceNumber: number;
    status: string;
    totalCents: number;
  };
  items: Array<{
    id: string;
    productId: string;
    name: string;
    unitPriceCents: number;
    quantity: number;
    lineTotalCents: number;
  }>;
}

/**
 * Cria um pedido de ponta a ponta (M8, ACTIVE_PLAN.md): valida a comanda, busca o
 * preço vigente no servidor (nunca o do corpo da requisição), roteia os itens em
 * tickets de produção por estação, grava ledger (`item_charge`) e o histórico
 * (`order_events` + outbox `domain_events`) — tudo numa única transação, e a
 * transação inteira passa pelo `withIdempotency` (mesma chave + mesmo corpo nunca cria
 * dois pedidos; corpo diferente é rejeitado).
 */
export async function createOrder(
  db: Db,
  context: OrderContext,
  idempotencyKey: string,
  input: CreateOrderInput,
): Promise<{ status: number; body: CreateOrderResult }> {
  return withTenant(db, context.tenantId, (tx) =>
    withIdempotency(tx, context.tenantId, 'orders.create', idempotencyKey, input, async () => {
      const [tab] = await tx
        .select()
        .from(schema.tabs)
        .where(and(eq(schema.tabs.id, context.tabId), eq(schema.tabs.tenantId, context.tenantId)))
        .for('update');
      if (!tab) throw new AppError('NOT_FOUND', 'Comanda não encontrada.');
      if (tab.status !== 'open') throw new AppError('TAB_CLOSED', 'Comanda já está fechada.');

      const productIds = [...new Set(input.items.map((i) => i.productId))];
      const productRows = await tx
        .select()
        .from(schema.products)
        .where(
          and(
            inArray(schema.products.id, productIds),
            eq(schema.products.tenantId, context.tenantId),
          ),
        );
      const productById = new Map(productRows.map((p) => [p.id, p]));

      const unavailable = productIds.filter((id) => {
        const p = productById.get(id);
        return !p || !p.isActive || !p.isAvailable;
      });
      if (unavailable.length > 0) {
        throw new AppError('ITEM_UNAVAILABLE', 'Um ou mais itens não estão disponíveis.', {
          productIds: unavailable,
        });
      }

      const [countRow] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.orders)
        .where(eq(schema.orders.tenantId, context.tenantId));
      const sequenceNumber = (countRow?.count ?? 0) + 1;

      const status = context.source === 'staff' ? 'accepted' : 'submitted';
      const orderId = newId();
      const now = new Date();
      await tx.insert(schema.orders).values({
        id: orderId,
        tenantId: context.tenantId,
        tabId: context.tabId,
        tableSessionId: context.tableSessionId,
        tableId: context.tableId,
        sequenceNumber,
        source: context.source,
        status,
        placedByGuestId: context.actor.type === 'guest' ? context.actor.guestId : null,
        placedByUserId: context.actor.type === 'user' ? context.actor.userId : null,
        idempotencyKey,
        notes: input.notes ?? null,
        acceptedAt: status === 'accepted' ? now : null,
      });

      const stationIds = [...new Set(productIds.map((id) => productById.get(id)!.stationId))];
      const ticketIdByStation = new Map(stationIds.map((stationId) => [stationId, newId()]));
      await tx.insert(schema.productionTickets).values(
        stationIds.map((stationId) => ({
          id: ticketIdByStation.get(stationId)!,
          tenantId: context.tenantId,
          orderId,
          stationId,
        })),
      );

      const itemRows = input.items.map((item) => {
        const product = productById.get(item.productId)!;
        const lineTotalCents = product.basePriceCents * item.quantity;
        return {
          id: newId(),
          tenantId: context.tenantId,
          orderId,
          productId: product.id,
          stationId: product.stationId,
          nameSnapshot: product.name,
          unitPriceCents: product.basePriceCents,
          quantity: item.quantity,
          lineTotalCents,
          notes: item.notes ?? null,
          ticketId: ticketIdByStation.get(product.stationId)!,
        };
      });
      await tx.insert(schema.orderItems).values(itemRows);

      await tx.insert(schema.ledgerEntries).values(
        itemRows.map((row) => ({
          id: newId(),
          tenantId: context.tenantId,
          tabId: context.tabId,
          type: 'item_charge' as const,
          amountCents: row.lineTotalCents,
          refType: 'order_item',
          refId: row.id,
          createdBy: context.actor,
        })),
      );

      await tx.insert(schema.orderEvents).values({
        id: newId(),
        tenantId: context.tenantId,
        orderId,
        type: 'order.created',
        toStatus: status,
        actor: context.actor,
      });

      await tx.insert(schema.domainEvents).values({
        id: newId(),
        tenantId: context.tenantId,
        channel: 'orders',
        type: 'order.created',
        payload: { orderId, tabId: context.tabId, sequenceNumber },
      });

      const totalCents = itemRows.reduce((sum, r) => sum + r.lineTotalCents, 0);
      return {
        status: 201,
        body: {
          order: { id: orderId, sequenceNumber, status, totalCents },
          items: itemRows.map((r) => ({
            id: r.id,
            productId: r.productId,
            name: r.nameSnapshot,
            unitPriceCents: r.unitPriceCents,
            quantity: r.quantity,
            lineTotalCents: r.lineTotalCents,
          })),
        },
      };
    }),
  );
}

type OrderReviewTransition = 'accept' | 'reject';
const ORDER_REVIEW_RULES: Record<OrderReviewTransition, { to: string }> = {
  accept: { to: 'accepted' },
  reject: { to: 'rejected' },
};

/**
 * Aceitar/rejeitar um pedido (M10) — o caminho que o M8 deixou pendente para sessão
 * não verificada (`customer_order_mode !== 'direct'`, `DOMAIN_MODEL.md §2.4`): o
 * pedido do cliente nasce `submitted` e fica aguardando até um staff decidir. Só
 * transiciona a partir de `submitted` — `UPDATE ... WHERE status = 'submitted'` para a
 * mesma proteção de corrida já usada no bump de ticket do M9 (dois staff decidindo ao
 * mesmo tempo: um vence, o outro vê o estado já resolvido, sem erro).
 */
export async function reviewOrder(
  db: Db,
  tenantId: string,
  orderId: string,
  actor: OrderActor,
  transition: OrderReviewTransition,
): Promise<{ id: string; status: string }> {
  const rule = ORDER_REVIEW_RULES[transition];
  return withTenant(db, tenantId, async (tx) => {
    const now = new Date();
    const [updated] = await tx
      .update(schema.orders)
      .set({
        status: rule.to,
        ...(transition === 'accept' ? { acceptedAt: now } : {}),
      })
      .where(
        and(
          eq(schema.orders.id, orderId),
          eq(schema.orders.tenantId, tenantId),
          eq(schema.orders.status, 'submitted'),
        ),
      )
      .returning({ id: schema.orders.id, status: schema.orders.status });

    const order =
      updated ??
      (
        await tx
          .select({ id: schema.orders.id, status: schema.orders.status })
          .from(schema.orders)
          .where(and(eq(schema.orders.id, orderId), eq(schema.orders.tenantId, tenantId)))
      )[0];
    if (!order) throw new AppError('NOT_FOUND', 'Pedido não encontrado.');

    if (updated) {
      await tx.insert(schema.orderEvents).values({
        id: newId(),
        tenantId,
        orderId,
        type: `order.${transition}ed`,
        fromStatus: 'submitted',
        toStatus: rule.to,
        actor,
      });
      await tx.insert(schema.domainEvents).values({
        id: newId(),
        tenantId,
        channel: 'orders',
        type: `order.${transition}ed`,
        payload: { orderId },
      });
    }

    return order;
  });
}

export interface CustomerOrderSummary {
  id: string;
  sequenceNumber: number;
  status: string;
  totalCents: number;
  submittedAt: string;
  items: Array<{ id: string; name: string; quantity: number; status: string }>;
}

/** Pedidos da MESMA sessão de mesa do cliente (nunca de outra sessão/tenant). */
export async function listOrdersForTableSession(
  db: Db,
  tenantId: string,
  tableSessionId: string,
): Promise<CustomerOrderSummary[]> {
  return withTenant(db, tenantId, async (tx) => {
    const orderRows = await tx
      .select()
      .from(schema.orders)
      .where(
        and(eq(schema.orders.tenantId, tenantId), eq(schema.orders.tableSessionId, tableSessionId)),
      );
    if (orderRows.length === 0) return [];

    const itemRows = await tx
      .select()
      .from(schema.orderItems)
      .where(
        inArray(
          schema.orderItems.orderId,
          orderRows.map((o) => o.id),
        ),
      );

    return orderRows
      .map((order) => {
        const items = itemRows.filter((i) => i.orderId === order.id);
        return {
          id: order.id,
          sequenceNumber: order.sequenceNumber,
          status: order.status,
          totalCents: items.reduce((sum, i) => sum + i.lineTotalCents, 0),
          submittedAt: order.submittedAt.toISOString(),
          items: items.map((i) => ({
            id: i.id,
            name: i.nameSnapshot,
            quantity: i.quantity,
            status: i.status,
          })),
        };
      })
      .sort((a, b) => b.sequenceNumber - a.sequenceNumber);
  });
}

export interface CancelOrderItemInput {
  stage: 'before_production' | 'after_production';
  reason: string;
  /** Só relevante em `after_production` — antes disso, cancelamento é sempre revertido. */
  chargeOnCancel?: boolean | undefined;
}

const BEFORE_PRODUCTION_STATUSES = ['queued'];
const AFTER_PRODUCTION_STATUSES = ['preparing', 'ready', 'delivered'];

/**
 * Cancela um item de pedido (M11, DOMAIN_MODEL.md §2.5/§2.9). Dois caminhos:
 * - `before_production` (item ainda `queued`): reversão TOTAL sempre (o cliente nunca
 *   chegou a receber nada) — `item_reversal` automático, sem decisão do operador.
 * - `after_production` (`preparing`/`ready`/`delivered`): exige `reason` +
 *   `chargeOnCancel` explícito — `true` (cliente paga, sem estorno) ou `false`
 *   (cortesia/perda, `item_reversal`).
 * Idempotente por construção: item já `cancelled` é devolvido sem nenhum efeito
 * colateral novo — nunca gera um segundo `item_reversal` para o mesmo item (dinheiro
 * duplicado é o pior tipo de bug aqui, regra 2 do CLAUDE.md).
 */
export async function cancelOrderItem(
  db: Db,
  tenantId: string,
  orderId: string,
  itemId: string,
  actor: OrderActor,
  input: CancelOrderItemInput,
): Promise<{ id: string; status: string; reversed: boolean }> {
  return withTenant(db, tenantId, async (tx) => {
    const [item] = await tx
      .select()
      .from(schema.orderItems)
      .where(
        and(
          eq(schema.orderItems.id, itemId),
          eq(schema.orderItems.orderId, orderId),
          eq(schema.orderItems.tenantId, tenantId),
        ),
      )
      .for('update');
    if (!item) throw new AppError('NOT_FOUND', 'Item de pedido não encontrado.');

    if (item.status === 'cancelled') {
      // Idempotente: já cancelado — não reprocessa, não gera segundo estorno.
      return { id: item.id, status: 'cancelled', reversed: item.chargeOnCancel === false };
    }

    const allowedStatuses =
      input.stage === 'before_production' ? BEFORE_PRODUCTION_STATUSES : AFTER_PRODUCTION_STATUSES;
    if (!allowedStatuses.includes(item.status)) {
      throw new AppError(
        'INVALID_TRANSITION',
        `Item está em '${item.status}', incompatível com cancelamento '${input.stage}'.`,
      );
    }

    const chargeOnCancel =
      input.stage === 'before_production' ? false : (input.chargeOnCancel ?? false);
    const reversed = !chargeOnCancel;

    const [order] = await tx
      .select({ tabId: schema.orders.tabId })
      .from(schema.orders)
      .where(and(eq(schema.orders.id, orderId), eq(schema.orders.tenantId, tenantId)));
    if (!order) throw new AppError('NOT_FOUND', 'Pedido não encontrado.');

    await tx
      .update(schema.orderItems)
      .set({
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelReason: input.reason,
        cancelStage: input.stage,
        chargeOnCancel,
      })
      .where(eq(schema.orderItems.id, itemId));

    if (reversed) {
      await tx.insert(schema.ledgerEntries).values({
        id: newId(),
        tenantId,
        tabId: order.tabId,
        type: 'item_reversal',
        amountCents: -item.lineTotalCents,
        refType: 'order_item',
        refId: item.id,
        reason: input.reason,
        createdBy: actor,
      });
    }

    await tx.insert(schema.orderEvents).values({
      id: newId(),
      tenantId,
      orderId,
      orderItemId: item.id,
      type: 'item.cancelled',
      fromStatus: item.status,
      toStatus: 'cancelled',
      actor,
    });

    await tx.insert(schema.domainEvents).values({
      id: newId(),
      tenantId,
      channel: 'orders',
      type: 'item.cancelled',
      payload: { orderId, itemId: item.id, ticketId: item.ticketId },
    });

    return { id: item.id, status: 'cancelled', reversed };
  });
}
