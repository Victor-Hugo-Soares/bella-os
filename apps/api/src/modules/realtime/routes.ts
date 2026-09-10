import type { FastifyInstance } from 'fastify';
import type { Db } from '@bella/db';
import { requireDevice } from '../identity/devices/require-device';
import { listNewEvents } from './service';

export interface RealtimeRoutesDeps {
  db: Db;
}

const POLL_INTERVAL_MS = 700;
const HEARTBEAT_INTERVAL_MS = 15_000;
const CHANNEL = 'orders';

function parseLastEventId(request: { headers: Record<string, unknown>; query: unknown }): bigint {
  const header = request.headers['last-event-id'];
  const fromHeader = Array.isArray(header) ? header[0] : header;
  const fromQuery =
    request.query && typeof request.query === 'object' && 'lastEventId' in request.query
      ? (request.query as { lastEventId?: string }).lastEventId
      : undefined;
  const raw = fromHeader ?? fromQuery;
  if (!raw) return 0n;
  try {
    return BigInt(raw);
  } catch {
    return 0n;
  }
}

/**
 * SSE (M9, ACTIVE_PLAN.md): autenticado por dispositivo (`X-Device-Token`, M3), emite
 * eventos do outbox `domain_events` do tenant do dispositivo. `Last-Event-ID` (header
 * ou `?lastEventId=`) faz o replay do que foi perdido numa desconexão — `seq` é
 * bigserial (M1), cresce monotonicamente por tenant, perfeito para isso. O "push" é
 * polling do outbox (ADR-033) — mais simples que LISTEN/NOTIFY, sem infraestrutura de
 * pub/sub nova.
 */
export async function realtimeRoutes(
  app: FastifyInstance,
  deps: RealtimeRoutesDeps,
): Promise<void> {
  const { db } = deps;

  app.get('/v1/stream', { preHandler: requireDevice(db) }, async (request, reply) => {
    const device = request.deviceActor!;
    let lastSeq = parseLastEventId(request);

    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    function write(event: { seq: string; type: string; payload: unknown }) {
      reply.raw.write(`id: ${event.seq}\n`);
      reply.raw.write(`event: ${event.type}\n`);
      reply.raw.write(`data: ${JSON.stringify(event.payload)}\n\n`);
    }

    async function poll() {
      const events = await listNewEvents(db, device.tenantId, CHANNEL, lastSeq);
      for (const event of events) {
        write(event);
        lastSeq = BigInt(event.seq);
      }
    }

    await poll();
    const pollTimer = setInterval(() => {
      poll().catch(() => {
        /* erro de polling não derruba a conexão SSE; próximo ciclo tenta de novo */
      });
    }, POLL_INTERVAL_MS);
    // Evento NOMEADO, não comentário SSE (`: heartbeat`) — um comentário é invisível
    // ao `EventSource` do browser (nenhum handler dispara), então o cliente nunca
    // saberia que o servidor está vivo. `data: {}` vazio, sem payload de negócio
    // (M20, ACTIVE_PLAN.md Gate de Plano #1).
    const heartbeatTimer = setInterval(() => {
      reply.raw.write('event: heartbeat\ndata: {}\n\n');
    }, HEARTBEAT_INTERVAL_MS);

    request.raw.on('close', () => {
      clearInterval(pollTimer);
      clearInterval(heartbeatTimer);
      reply.raw.end();
    });
  });
}
