import type { FastifyInstance } from 'fastify';
import { fromNodeHeaders } from 'better-auth/node';
import { AppError } from '../../lib/errors';
import type { Auth } from './auth';

export interface IdentityDeps {
  auth: Auth;
}

/**
 * Monta o Better Auth num Fastify sem plugin oficial (não existe um — confirmado
 * pesquisando a documentação e os tipos instalados; ver ACTIVE_PLAN.md M2). O handler
 * do Better Auth é uma função `(Request) => Promise<Response>` no padrão Fetch; ele lê
 * o corpo da requisição sozinho, então o parser de JSON default do Fastify precisa
 * ficar DESLIGADO só dentro deste plugin (escopo via encapsulamento do Fastify) — senão
 * o corpo já teria sido consumido/parseado antes de chegar aqui.
 *
 * `addContentTypeParser('*', ...)` sozinho NÃO basta: por baixo, o Fastify guarda o
 * wildcard sob uma chave própria (`''`) e só recorre a ela quando não existe parser
 * específico para aquele content-type — e o parser default de `application/json` já
 * está registrado desde a raiz (herdado por cópia do Map ao encapsular o plugin), então
 * ele sempre vence para requisições JSON, mesmo dentro deste escopo. Confirmado lendo
 * `fastify/lib/content-type-parser.js` (`getParser`/`existingParser`) depois de a CI
 * pegar isto de verdade: sign-up/sign-in chegavam ao Better Auth com corpo `undefined`.
 * Por isso `application/json` é sobrescrito explicitamente, além do wildcard.
 */
export async function identityRoutes(app: FastifyInstance, deps: IdentityDeps): Promise<void> {
  const { auth } = deps;

  const passThroughBuffer = (
    _request: unknown,
    payload: Buffer,
    done: (err: Error | null, body?: unknown) => void,
  ): void => {
    done(null, payload);
  };
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, passThroughBuffer);
  app.addContentTypeParser('*', { parseAs: 'buffer' }, passThroughBuffer);

  app.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    handler: async (request, reply) => {
      const url = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`);
      const headers = fromNodeHeaders(request.headers);
      const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
      const body =
        hasBody && Buffer.isBuffer(request.body) && request.body.length > 0 ? request.body : null;

      const fetchRequest = new Request(url, {
        method: request.method,
        headers,
        ...(body ? { body } : {}),
      });

      const response = await auth.handler(fetchRequest);

      reply.status(response.status);
      response.headers.forEach((value, key) => {
        // content-length é recalculado pelo próprio Fastify ao enviar o corpo.
        if (key.toLowerCase() !== 'content-length') reply.header(key, value);
      });
      const text = await response.text();
      return reply.send(text);
    },
  });

  app.get('/v1/me', async (request) => {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) {
      throw new AppError('UNAUTHENTICATED', 'Sessão inválida ou expirada.');
    }
    return session;
  });
}
