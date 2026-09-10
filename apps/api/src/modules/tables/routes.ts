import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from '@bella/db';
import {
  createAreaSchema,
  createServiceRequestSchema,
  createTableSchema,
  updateAreaSchema,
  updateTableSchema,
} from '@bella/contracts';
import { AppError } from '../../lib/errors';
import { buildSetCookie, parseCookies } from '../../lib/cookies';
import type { Auth } from '../identity/auth';
import { requirePermission } from '../identity/require-permission';
import * as tablesService from './service';

export interface TablesRoutesDeps {
  db: Db;
  auth: Auth;
  webOriginIsHttps: boolean;
}

function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AppError('VALIDATION_ERROR', result.error.issues.map((i) => i.message).join('; '));
  }
  return result.data;
}

const listQuerySchema = z.object({ includeInactive: z.coerce.boolean().default(false) });

export const GUEST_SESSION_COOKIE = 'bella_guest_session';
const GUEST_SESSION_MAX_AGE_SECONDS = 60 * 60 * 12; // 12h — dura uma noite de operação.

/**
 * Mesas, áreas e sessão de mesa (M6, ACTIVE_PLAN.md). Admin (`/v1/tables/*`,
 * `/v1/areas/*`) exige `tables.manage`. `/public/*` é a rota do CLIENTE — sem sessão de
 * staff, resolvida só pelo slug do tenant + código da mesa (mesmo espírito de
 * `/v1/devices/exchange`, M3: pública de propósito, segurança vem do segredo em si).
 */
export async function tablesRoutes(app: FastifyInstance, deps: TablesRoutesDeps): Promise<void> {
  const { db, auth, webOriginIsHttps } = deps;
  const manage = { preHandler: requirePermission(db, auth, 'tables.manage') };

  // Áreas
  app.get('/v1/areas', manage, async (request) => {
    const query = parseOrThrow(listQuerySchema, request.query);
    const areas = await tablesService.listAreas(db, request.actor!.tenantId, query.includeInactive);
    return { areas };
  });
  app.post('/v1/areas', manage, async (request) => {
    const body = parseOrThrow(createAreaSchema, request.body);
    const area = await tablesService.createArea(db, request.actor!.tenantId, body);
    return { area };
  });
  app.patch<{ Params: { id: string } }>('/v1/areas/:id', manage, async (request) => {
    const body = parseOrThrow(updateAreaSchema, request.body);
    const area = await tablesService.updateArea(
      db,
      request.actor!.tenantId,
      request.params.id,
      body,
    );
    return { area };
  });

  // Mesas
  app.get('/v1/tables', manage, async (request) => {
    const query = parseOrThrow(listQuerySchema, request.query);
    const tables = await tablesService.listTables(
      db,
      request.actor!.tenantId,
      query.includeInactive,
    );
    return { tables };
  });
  app.post('/v1/tables', manage, async (request) => {
    const body = parseOrThrow(createTableSchema, request.body);
    const table = await tablesService.createTable(db, request.actor!.tenantId, body);
    return { table };
  });
  app.patch<{ Params: { id: string } }>('/v1/tables/:id', manage, async (request) => {
    const body = parseOrThrow(updateTableSchema, request.body);
    const table = await tablesService.updateTable(
      db,
      request.actor!.tenantId,
      request.params.id,
      body,
    );
    return { table };
  });

  // Sessão de mesa — rota pública do cliente
  app.post<{ Params: { tenantSlug: string; code: string } }>(
    '/public/:tenantSlug/tables/:code/session',
    async (request, reply) => {
      const result = await tablesService.openTableSession(
        db,
        request.params.tenantSlug,
        request.params.code,
      );
      reply.header(
        'set-cookie',
        buildSetCookie(GUEST_SESSION_COOKIE, result.guestToken, {
          maxAgeSeconds: GUEST_SESSION_MAX_AGE_SECONDS,
          secure: webOriginIsHttps,
        }),
      );
      return {
        tableSessionId: result.tableSessionId,
        tabId: result.tabId,
        tableLabel: result.tableLabel,
      };
    },
  );

  // Prova de que o cookie de fato autentica (consumido pelo M7 de verdade; aqui só
  // confirma a identidade resolvida, sem nenhuma rota de negócio de cliente ainda).
  app.get('/public/me/table-session', async (request) => {
    const cookies = parseCookies(request.headers.cookie);
    const actor = await tablesService.resolveGuestActor(db, cookies[GUEST_SESSION_COOKIE]);
    return {
      tableSessionId: actor.tableSessionId,
      tabId: actor.tabId,
    };
  });

  // Chamados (M10) — cliente cria via cookie de sessão de mesa; staff lista/atende.
  app.post('/public/:tenantSlug/service-requests', async (request) => {
    const cookies = parseCookies(request.headers.cookie);
    const guest = await tablesService.resolveGuestActor(db, cookies[GUEST_SESSION_COOKIE]);
    const body = parseOrThrow(createServiceRequestSchema, request.body);
    const serviceRequest = await tablesService.createServiceRequest(
      db,
      guest.tenantId,
      guest.tableSessionId,
      guest.guestId,
      body,
    );
    return { serviceRequest };
  });

  app.get('/v1/service-requests', manage, async (request) => {
    const serviceRequests = await tablesService.listOpenServiceRequests(
      db,
      request.actor!.tenantId,
    );
    return { serviceRequests };
  });

  app.patch<{ Params: { id: string } }>(
    '/v1/service-requests/:id/acknowledge',
    manage,
    async (request) => {
      const actor = request.actor!;
      const serviceRequest = await tablesService.transitionServiceRequest(
        db,
        actor.tenantId,
        request.params.id,
        actor.userId,
        'acknowledge',
      );
      return { serviceRequest };
    },
  );

  app.patch<{ Params: { id: string } }>(
    '/v1/service-requests/:id/done',
    manage,
    async (request) => {
      const actor = request.actor!;
      const serviceRequest = await tablesService.transitionServiceRequest(
        db,
        actor.tenantId,
        request.params.id,
        actor.userId,
        'done',
      );
      return { serviceRequest };
    },
  );
}
