import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { errorEnvelopeSchema, healthResponseSchema, readyResponseSchema } from '@bella/contracts';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp({
    config: loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }),
    db: null,
    version: 'test',
  });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('GET /health', () => {
  it('responde ok com contrato válido e propaga x-request-id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-request-id': 'req-123' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['x-request-id']).toBe('req-123');
    expect(healthResponseSchema.safeParse(res.json()).success).toBe(true);
  });
  it('gera request id quando o cliente não envia', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(typeof res.headers['x-request-id']).toBe('string');
    expect(String(res.headers['x-request-id']).length).toBeGreaterThan(10);
  });
});

describe('GET /ready sem banco configurado', () => {
  it('informa degraded/not_configured (nunca finge estar pronto)', async () => {
    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(200);
    const parsed = readyResponseSchema.parse(res.json());
    expect(parsed.status).toBe('degraded');
    expect(parsed.checks.database).toBe('not_configured');
  });
});

describe('rota inexistente', () => {
  it('devolve envelope de erro padronizado com request_id', async () => {
    const res = await app.inject({ method: 'GET', url: '/nao-existe' });
    expect(res.statusCode).toBe(404);
    const body = errorEnvelopeSchema.parse(res.json());
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.request_id).toBe(res.headers['x-request-id']);
  });
});

describe('configuração', () => {
  it('rejeita DATABASE_URL inválida com mensagem legível', () => {
    expect(() => loadConfig({ DATABASE_URL: 'nao-e-url' })).toThrow(/DATABASE_URL/);
  });
});
