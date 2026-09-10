import { and, eq, gte, inArray, lt } from 'drizzle-orm';
import type { Db } from '@bella/db';
import { schema, withTenant } from '@bella/db';
import type { DailyReportQuery } from '@bella/contracts';

/**
 * Relatório do dia operacional (M16, ACTIVE_PLAN.md). `from`/`to` são timestamps ISO
 * explícitos — sem cálculo automático de "dia operacional" (Gate de Plano #2). Item
 * conta no faturamento com a MESMA regra de `computeBill` (M12): não cancelado OU
 * cancelado com `charge_on_cancel=true` — nunca reimplementada, só replicada.
 */

interface ProductAgg {
  productId: string;
  name: string;
  quantity: number;
  revenueCents: number;
}

interface OperatorAgg {
  userId: string;
  name: string;
  count: number;
  amountCents: number;
}

export interface DailyReport {
  fromISO: string;
  toISO: string;
  faturamentoCents: number;
  itemsSoldCount: number;
  tabsServedCount: number;
  ticketMedioCents: number;
  topProducts: ProductAgg[];
  cancellationsByOperator: OperatorAgg[];
  discountsByOperator: OperatorAgg[];
}

function countsAsSold(item: { status: string; chargeOnCancel: boolean | null }): boolean {
  return item.status !== 'cancelled' || item.chargeOnCancel === true;
}

export async function getDailyReport(
  db: Db,
  tenantId: string,
  query: DailyReportQuery,
): Promise<DailyReport> {
  const from = new Date(query.from);
  const to = new Date(query.to);

  return withTenant(db, tenantId, async (tx) => {
    const orderRows = await tx
      .select({ id: schema.orders.id, tabId: schema.orders.tabId })
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.tenantId, tenantId),
          gte(schema.orders.submittedAt, from),
          lt(schema.orders.submittedAt, to),
        ),
      );
    const orderIds = orderRows.map((o) => o.id);
    const tabIdByOrderId = new Map(orderRows.map((o) => [o.id, o.tabId]));

    const itemRows =
      orderIds.length === 0
        ? []
        : await tx
            .select()
            .from(schema.orderItems)
            .where(
              and(
                eq(schema.orderItems.tenantId, tenantId),
                inArray(schema.orderItems.orderId, orderIds),
              ),
            );

    let faturamentoCents = 0;
    let itemsSoldCount = 0;
    const tabsServed = new Set<string>();
    const productMap = new Map<string, ProductAgg>();

    for (const item of itemRows) {
      if (!countsAsSold(item)) continue;
      faturamentoCents += item.lineTotalCents;
      itemsSoldCount += item.quantity;
      const tabId = tabIdByOrderId.get(item.orderId);
      if (tabId) tabsServed.add(tabId);

      const existing = productMap.get(item.productId);
      if (existing) {
        existing.quantity += item.quantity;
        existing.revenueCents += item.lineTotalCents;
      } else {
        productMap.set(item.productId, {
          productId: item.productId,
          name: item.nameSnapshot,
          quantity: item.quantity,
          revenueCents: item.lineTotalCents,
        });
      }
    }

    const topProducts = [...productMap.values()]
      .sort((a, b) => b.revenueCents - a.revenueCents)
      .slice(0, 10);

    const ticketMedioCents =
      tabsServed.size > 0 ? Math.round(faturamentoCents / tabsServed.size) : 0;

    const cancelEventRows =
      orderIds.length === 0
        ? []
        : await tx
            .select()
            .from(schema.orderEvents)
            .where(
              and(
                eq(schema.orderEvents.tenantId, tenantId),
                eq(schema.orderEvents.type, 'item.cancelled'),
                gte(schema.orderEvents.at, from),
                lt(schema.orderEvents.at, to),
              ),
            );
    const cancelledItemIds = new Set(
      cancelEventRows.map((e) => e.orderItemId).filter((id): id is string => id !== null),
    );
    // Só conta como "valor revertido" o item que realmente foi estornado
    // (chargeOnCancel !== true) — item cancelado com cobrança mantida não perdeu dinheiro.
    const reversedByItemId = new Map(
      itemRows
        .filter((i) => cancelledItemIds.has(i.id) && i.chargeOnCancel !== true)
        .map((i) => [i.id, i.lineTotalCents] as const),
    );

    const cancellationCounts = new Map<string, { count: number; amountCents: number }>();
    for (const event of cancelEventRows) {
      const actor = event.actor as { type?: string; userId?: string } | null;
      if (!actor || actor.type !== 'user' || !actor.userId) continue;
      const current = cancellationCounts.get(actor.userId) ?? { count: 0, amountCents: 0 };
      current.count += 1;
      current.amountCents += reversedByItemId.get(event.orderItemId ?? '') ?? 0;
      cancellationCounts.set(actor.userId, current);
    }

    const discountRows = await tx
      .select()
      .from(schema.ledgerEntries)
      .where(
        and(
          eq(schema.ledgerEntries.tenantId, tenantId),
          eq(schema.ledgerEntries.type, 'discount'),
          gte(schema.ledgerEntries.createdAt, from),
          lt(schema.ledgerEntries.createdAt, to),
        ),
      );
    const discountCounts = new Map<string, { count: number; amountCents: number }>();
    for (const entry of discountRows) {
      const actor = entry.createdBy as { type?: string; userId?: string } | null;
      if (!actor || actor.type !== 'user' || !actor.userId) continue;
      const current = discountCounts.get(actor.userId) ?? { count: 0, amountCents: 0 };
      current.count += 1;
      current.amountCents += -entry.amountCents; // ledger grava negativo; relatório mostra positivo
      discountCounts.set(actor.userId, current);
    }

    const operatorIds = [...new Set([...cancellationCounts.keys(), ...discountCounts.keys()])];
    const userRows =
      operatorIds.length === 0
        ? []
        : await tx
            .select({ id: schema.users.id, name: schema.users.name })
            .from(schema.users)
            .where(inArray(schema.users.id, operatorIds));
    const nameById = new Map(userRows.map((u) => [u.id, u.name]));

    const toOperatorAgg = (
      map: Map<string, { count: number; amountCents: number }>,
    ): OperatorAgg[] =>
      [...map.entries()]
        .map(([userId, agg]) => ({
          userId,
          name: nameById.get(userId) ?? 'Desconhecido',
          count: agg.count,
          amountCents: agg.amountCents,
        }))
        .sort((a, b) => b.amountCents - a.amountCents);

    return {
      fromISO: from.toISOString(),
      toISO: to.toISOString(),
      faturamentoCents,
      itemsSoldCount,
      tabsServedCount: tabsServed.size,
      ticketMedioCents,
      topProducts,
      cancellationsByOperator: toOperatorAgg(cancellationCounts),
      discountsByOperator: toOperatorAgg(discountCounts),
    };
  });
}
