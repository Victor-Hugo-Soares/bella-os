import type { FastifyInstance } from 'fastify';
import type { z } from 'zod';
import type { Db } from '@bella/db';
import { dailyReportQuerySchema } from '@bella/contracts';
import { AppError } from '../../lib/errors';
import type { Auth } from '../identity/auth';
import { requirePermission } from '../identity/require-permission';
import { getDailyReport } from './service';

export interface ReportsRoutesDeps {
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

/** Relatório do dia operacional (M16, ACTIVE_PLAN.md). Leitura, `reports.view`. */
export async function reportsRoutes(app: FastifyInstance, deps: ReportsRoutesDeps): Promise<void> {
  const { db, auth } = deps;

  app.get(
    '/v1/reports/daily',
    { preHandler: requirePermission(db, auth, 'reports.view') },
    async (request) => {
      const actor = request.actor!;
      const query = parseOrThrow(dailyReportQuerySchema, request.query);
      const report = await getDailyReport(db, actor.tenantId, query);
      return { report };
    },
  );
}
