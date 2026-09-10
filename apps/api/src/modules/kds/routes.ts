import type { FastifyInstance } from 'fastify';
import type { Db } from '@bella/db';
import { requireDevice } from '../identity/devices/require-device';
import { listActiveTickets, transitionTicket } from './service';

export interface KdsRoutesDeps {
  db: Db;
}

/**
 * KDS (M9, ACTIVE_PLAN.md): autenticado por dispositivo (`X-Device-Token`, M3), nunca
 * por sessão de staff. `stationIds` sempre vem do dispositivo resolvido, nunca de
 * entrada do cliente — um KDS só vê/transiciona tickets das próprias estações.
 */
export async function kdsRoutes(app: FastifyInstance, deps: KdsRoutesDeps): Promise<void> {
  const { db } = deps;
  const authed = { preHandler: requireDevice(db) };

  app.get('/v1/kds/tickets', authed, async (request) => {
    const device = request.deviceActor!;
    const tickets = await listActiveTickets(db, device.tenantId, device.stationIds);
    return { tickets };
  });

  app.post<{ Params: { id: string } }>('/v1/kds/tickets/:id/start', authed, async (request) => {
    const device = request.deviceActor!;
    const ticket = await transitionTicket(
      db,
      device.tenantId,
      device.stationIds,
      request.params.id,
      'start',
    );
    return { ticket };
  });

  app.post<{ Params: { id: string } }>('/v1/kds/tickets/:id/ready', authed, async (request) => {
    const device = request.deviceActor!;
    const ticket = await transitionTicket(
      db,
      device.tenantId,
      device.stationIds,
      request.params.id,
      'ready',
    );
    return { ticket };
  });

  app.post<{ Params: { id: string } }>('/v1/kds/tickets/:id/recall', authed, async (request) => {
    const device = request.deviceActor!;
    const ticket = await transitionTicket(
      db,
      device.tenantId,
      device.stationIds,
      request.params.id,
      'recall',
    );
    return { ticket };
  });
}
