import type { FastifyInstance } from 'fastify';
import type { HealthResponse, ReadyResponse } from '@bella/contracts';
import type { DbHandle } from '@bella/db';
import { sql } from 'drizzle-orm';

export interface HealthDeps {
  version: string;
  db: DbHandle | null;
  startedAt: number;
}

export async function healthRoutes(app: FastifyInstance, deps: HealthDeps): Promise<void> {
  app.get('/health', async (): Promise<HealthResponse> => ({
    status: 'ok',
    service: 'bella-api',
    version: deps.version,
    uptime_seconds: Math.round((Date.now() - deps.startedAt) / 1000),
    server_time: new Date().toISOString(),
  }));

  app.get('/ready', async (request, reply): Promise<ReadyResponse> => {
    if (!deps.db) {
      return { status: 'degraded', checks: { database: 'not_configured' } };
    }
    try {
      const startedAt = performance.now();
      await deps.db.db.execute(sql`select 1`);
      const database_latency_ms = Math.round((performance.now() - startedAt) * 100) / 100;
      return { status: 'ready', checks: { database: 'ok', database_latency_ms } };
    } catch (err) {
      request.log.error({ err }, 'banco indisponível');
      reply.status(503);
      return { status: 'degraded', checks: { database: 'error' } };
    }
  });
}
