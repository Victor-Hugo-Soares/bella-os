import { and, asc, eq, gt } from 'drizzle-orm';
import type { Db } from '@bella/db';
import { schema, withTenant } from '@bella/db';

export interface StreamEvent {
  seq: string;
  id: string;
  type: string;
  payload: unknown;
  at: string;
}

/**
 * Eventos do outbox (`domain_events`, canal `orders`) mais recentes que `afterSeq` —
 * usado tanto no replay inicial (`Last-Event-ID`) quanto no polling periódico do SSE
 * (M9, ver `routes.ts` — decisão registrada em ADR-033: o "push" aqui é polling do
 * outbox, não LISTEN/NOTIFY do Postgres; mais simples, sem infraestrutura de pub/sub
 * nova, suficiente para a meta de "aparece em poucos segundos").
 */
export async function listNewEvents(
  db: Db,
  tenantId: string,
  channel: string,
  afterSeq: bigint,
): Promise<StreamEvent[]> {
  const rows = await withTenant(db, tenantId, (tx) =>
    tx
      .select()
      .from(schema.domainEvents)
      .where(
        and(
          eq(schema.domainEvents.tenantId, tenantId),
          eq(schema.domainEvents.channel, channel),
          gt(schema.domainEvents.seq, afterSeq),
        ),
      )
      .orderBy(asc(schema.domainEvents.seq)),
  );
  return rows.map((r) => ({
    seq: r.seq.toString(),
    id: r.id,
    type: r.type,
    payload: r.payload,
    at: r.createdAt.toISOString(),
  }));
}
