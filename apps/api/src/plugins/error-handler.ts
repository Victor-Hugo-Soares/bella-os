import type { FastifyInstance } from 'fastify';
import type { ErrorEnvelope } from '@bella/contracts';
import { AppError } from '../lib/errors';

function statusOf(error: unknown): number {
  const candidate = (error as { statusCode?: unknown } | null)?.statusCode;
  return typeof candidate === 'number' ? candidate : 500;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: unknown, request, reply) => {
    const requestId = request.id;

    if (error instanceof AppError) {
      const body: ErrorEnvelope = {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          request_id: requestId,
        },
      };
      request.log.warn({ err: error, code: error.code }, 'erro de aplicação');
      return reply.status(error.status).send(body);
    }

    // Erros de validação do Fastify (schema), parsing e afins carregam statusCode 4xx.
    const status = statusOf(error);
    if (status >= 400 && status < 500) {
      const code =
        status === 404 ? 'NOT_FOUND' : status === 429 ? 'RATE_LIMITED' : 'VALIDATION_ERROR';
      const body: ErrorEnvelope = {
        error: { code, message: messageOf(error), request_id: requestId },
      };
      request.log.info({ err: error }, 'erro de requisição');
      return reply.status(status).send(body);
    }

    request.log.error({ err: error }, 'erro interno');
    const body: ErrorEnvelope = {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Erro interno. Informe o código da requisição ao suporte.',
        request_id: requestId,
      },
    };
    return reply.status(500).send(body);
  });

  app.setNotFoundHandler((request, reply) => {
    const body: ErrorEnvelope = {
      error: {
        code: 'NOT_FOUND',
        message: `Rota não encontrada: ${request.method} ${request.url}`,
        request_id: request.id,
      },
    };
    return reply.status(404).send(body);
  });
}
