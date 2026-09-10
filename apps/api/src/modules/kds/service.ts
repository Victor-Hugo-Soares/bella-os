import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '@bella/db';
import { schema, withTenant } from '@bella/db';
import { AppError } from '../../lib/errors';

export interface TicketItem {
  id: string;
  name: string;
  quantity: number;
  notes: string | null;
  /** 'cancelled' (M11) é o único valor que a tela do KDS precisa destacar. */
  status: string;
}

export interface Ticket {
  id: string;
  orderId: string;
  stationId: string;
  status: string;
  queuedAt: string;
  startedAt: string | null;
  readyAt: string | null;
  recallCount: number;
  items: TicketItem[];
}

/**
 * Tickets ativos (`queued`/`preparing`/`ready`) das estações do dispositivo (M9).
 * `stationIds` vem do dispositivo autenticado (M3, campo `devices.station_ids`
 * preenchido no pareamento) — nunca de entrada do cliente.
 */
export async function listActiveTickets(
  db: Db,
  tenantId: string,
  stationIds: string[],
): Promise<Ticket[]> {
  if (stationIds.length === 0) return [];
  return withTenant(db, tenantId, async (tx) => {
    const tickets = await tx
      .select()
      .from(schema.productionTickets)
      .where(
        and(
          eq(schema.productionTickets.tenantId, tenantId),
          inArray(schema.productionTickets.stationId, stationIds),
          inArray(schema.productionTickets.status, ['queued', 'preparing', 'ready']),
        ),
      );
    if (tickets.length === 0) return [];

    const items = await tx
      .select()
      .from(schema.orderItems)
      .where(
        and(
          eq(schema.orderItems.tenantId, tenantId),
          inArray(
            schema.orderItems.ticketId,
            tickets.map((t) => t.id),
          ),
        ),
      );

    return tickets.map((ticket) => ({
      id: ticket.id,
      orderId: ticket.orderId,
      stationId: ticket.stationId,
      status: ticket.status,
      queuedAt: ticket.queuedAt.toISOString(),
      startedAt: ticket.startedAt?.toISOString() ?? null,
      readyAt: ticket.readyAt?.toISOString() ?? null,
      recallCount: ticket.recallCount,
      items: items
        .filter((i) => i.ticketId === ticket.id)
        .map((i) => ({
          id: i.id,
          name: i.nameSnapshot,
          quantity: i.quantity,
          notes: i.notes,
          status: i.status,
        })),
    }));
  });
}

type Transition = 'start' | 'ready' | 'recall';

const TRANSITION_RULES: Record<Transition, { from: string; to: string }> = {
  start: { from: 'queued', to: 'preparing' },
  ready: { from: 'preparing', to: 'ready' },
  recall: { from: 'ready', to: 'preparing' },
};

/**
 * Transição de estado do ticket, atômica e IDEMPOTENTE (DOMAIN_MODEL.md §2.6: "bump
 * em ticket já `ready` é idempotente, pois dois KDS podem bumpar quase ao mesmo
 * tempo"). `UPDATE ... WHERE status = $de` garante no próprio banco que só quem
 * chega primeiro muda o estado — nunca um `SELECT` seguido de `UPDATE` separado
 * (que teria uma janela de corrida entre os dois dispositivos).
 */
export async function transitionTicket(
  db: Db,
  tenantId: string,
  stationIds: string[],
  ticketId: string,
  transition: Transition,
): Promise<Ticket> {
  const rule = TRANSITION_RULES[transition];
  return withTenant(db, tenantId, async (tx) => {
    const [current] = await tx
      .select()
      .from(schema.productionTickets)
      .where(
        and(
          eq(schema.productionTickets.id, ticketId),
          eq(schema.productionTickets.tenantId, tenantId),
        ),
      );
    if (!current) throw new AppError('NOT_FOUND', 'Ticket não encontrado.');
    if (!stationIds.includes(current.stationId)) {
      throw new AppError('PERMISSION_DENIED', 'Este dispositivo não atende esta estação.');
    }

    if (current.status === rule.to) {
      // Idempotente: já está no estado alvo (segundo bump quase simultâneo).
      return ticketRowToTicket(tx, current);
    }
    if (current.status !== rule.from) {
      throw new AppError(
        'INVALID_TRANSITION',
        `Transição inválida: ticket está em '${current.status}', esperado '${rule.from}'.`,
      );
    }

    const now = new Date();
    const setFields: Record<string, unknown> = { status: rule.to };
    if (transition === 'start') setFields.startedAt = now;
    if (transition === 'ready') setFields.readyAt = now;
    if (transition === 'recall') setFields.recallCount = current.recallCount + 1;

    const [updated] = await tx
      .update(schema.productionTickets)
      .set(setFields)
      .where(
        and(
          eq(schema.productionTickets.id, ticketId),
          eq(schema.productionTickets.tenantId, tenantId),
          eq(schema.productionTickets.status, rule.from),
        ),
      )
      .returning();
    if (!updated) {
      // Perdeu a corrida para outro dispositivo entre o SELECT e o UPDATE — não é
      // erro do cliente, é o caso "dois KDS bumpando quase ao mesmo tempo".
      const [afterRace] = await tx
        .select()
        .from(schema.productionTickets)
        .where(eq(schema.productionTickets.id, ticketId));
      return ticketRowToTicket(tx, afterRace!);
    }

    await tx
      .update(schema.orderItems)
      .set({ status: rule.to === 'preparing' ? 'preparing' : rule.to })
      .where(eq(schema.orderItems.ticketId, ticketId));

    return ticketRowToTicket(tx, updated);
  });
}

async function ticketRowToTicket(
  tx: Parameters<Parameters<Db['transaction']>[0]>[0],
  row: typeof schema.productionTickets.$inferSelect,
): Promise<Ticket> {
  const items = await tx
    .select()
    .from(schema.orderItems)
    .where(eq(schema.orderItems.ticketId, row.id));
  return {
    id: row.id,
    orderId: row.orderId,
    stationId: row.stationId,
    status: row.status,
    queuedAt: row.queuedAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    readyAt: row.readyAt?.toISOString() ?? null,
    recallCount: row.recallCount,
    items: items.map((i) => ({
      id: i.id,
      name: i.nameSnapshot,
      quantity: i.quantity,
      notes: i.notes,
      status: i.status,
    })),
  };
}

/**
 * Tickets `ready` de TODAS as estações do tenant (M10, "expedição") — visão de staff,
 * não de um KDS de estação específica; sem filtro de `stationIds` de propósito (quem
 * leva à mesa precisa ver tudo pronto, não só de uma estação).
 */
export async function listReadyTicketsForTenant(db: Db, tenantId: string): Promise<Ticket[]> {
  return withTenant(db, tenantId, async (tx) => {
    const tickets = await tx
      .select()
      .from(schema.productionTickets)
      .where(
        and(
          eq(schema.productionTickets.tenantId, tenantId),
          eq(schema.productionTickets.status, 'ready'),
        ),
      );
    if (tickets.length === 0) return [];
    const items = await tx
      .select()
      .from(schema.orderItems)
      .where(
        inArray(
          schema.orderItems.ticketId,
          tickets.map((t) => t.id),
        ),
      );
    return tickets.map((ticket) => ({
      id: ticket.id,
      orderId: ticket.orderId,
      stationId: ticket.stationId,
      status: ticket.status,
      queuedAt: ticket.queuedAt.toISOString(),
      startedAt: ticket.startedAt?.toISOString() ?? null,
      readyAt: ticket.readyAt?.toISOString() ?? null,
      recallCount: ticket.recallCount,
      items: items
        .filter((i) => i.ticketId === ticket.id)
        .map((i) => ({
          id: i.id,
          name: i.nameSnapshot,
          quantity: i.quantity,
          notes: i.notes,
          status: i.status,
        })),
    }));
  });
}
