import Fastify, { LogController, type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import { randomUUID } from 'node:crypto';
import type { DbHandle } from '@bella/db';
import type { AppConfig } from './config';
import { registerErrorHandler } from './plugins/error-handler';
import { healthRoutes } from './modules/health/routes';

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
          '*.password',
          '*.pin',
          '*.token',
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
    // CORS restrito por ambiente (WEB_ORIGIN) entra no M4; por ora nenhuma origem cruzada.
    origin: false,
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

  return app;
}
