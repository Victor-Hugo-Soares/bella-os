import Fastify, { LogController, type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import { randomUUID } from 'node:crypto';
import type { DbHandle } from '@bella/db';
import type { AppConfig } from './config';
import { registerErrorHandler } from './plugins/error-handler';
import { healthRoutes } from './modules/health/routes';
import { createAuth } from './modules/identity/auth';
import { identityRoutes } from './modules/identity/routes';
import { deviceRoutes } from './modules/identity/devices/routes';

// Versão lida do package.json em tempo de build/execução (tsup embute o JSON).
import packageJson from '../package.json' with { type: 'json' };

export const API_VERSION: string = packageJson.version;

export interface BuildAppOptions {
  config: AppConfig;
  db?: DbHandle | null;
  version?: string;
}

/**
 * Monta a instância Fastify sem escutar porta — usada tanto por `index.ts` quanto pelos
 * testes via `app.inject()`. Toda configuração transversal (log, request id, erros, CORS) vive aqui.
 */
export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const { config } = options;
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      // nunca logar credenciais/tokens (gate G6)
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.headers["x-device-token"]',
          '*.password',
          '*.pin',
          '*.token',
          '*.tokenHash',
          '*.pinHash',
        ],
        censor: '[REDACTED]',
      },
      ...(config.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty' } } : {}),
    },
    requestIdHeader: 'x-request-id',
    // rótulo do id nos logs = request_id (mesmo nome do envelope de erro e do header)
    logController: new LogController({ requestIdLogLabel: 'request_id' }),
    genReqId: () => randomUUID(),
    trustProxy: true,
  });

  await app.register(sensible);
  await app.register(cors, {
    // Sem apps/web ainda (M4): CORS só libera a origem configurada, se houver.
    origin: config.WEB_ORIGIN ?? false,
    credentials: true,
  });

  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  registerErrorHandler(app);

  await app.register(healthRoutes, {
    version: options.version ?? API_VERSION,
    db: options.db ?? null,
    startedAt: Date.now(),
  });

  const db = options.db ?? null;
  if (db) {
    const auth = createAuth({
      db: db.db,
      secret: config.BETTER_AUTH_SECRET,
      webOrigin: config.WEB_ORIGIN,
      baseURL: config.BETTER_AUTH_URL,
    });
    await app.register(identityRoutes, { auth });
    await app.register(deviceRoutes, { db: db.db, auth });
  }

  return app;
}
