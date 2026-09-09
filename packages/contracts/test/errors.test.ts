import { describe, expect, it } from 'vitest';
import { ERROR_CODES, HTTP_STATUS_BY_CODE, errorEnvelopeSchema } from '../src/errors';
import { healthResponseSchema } from '../src/health';

describe('contracts/errors', () => {
  it('todo código tem status HTTP mapeado', () => {
    for (const code of ERROR_CODES) {
      expect(HTTP_STATUS_BY_CODE[code]).toBeGreaterThanOrEqual(400);
    }
  });
  it('valida envelope correto e rejeita código desconhecido', () => {
    expect(
      errorEnvelopeSchema.safeParse({
        error: { code: 'TAB_CLOSED', message: 'Comanda fechada', request_id: 'abc' },
      }).success,
    ).toBe(true);
    expect(
      errorEnvelopeSchema.safeParse({
        error: { code: 'NOPE', message: 'x', request_id: 'abc' },
      }).success,
    ).toBe(false);
  });
});

describe('contracts/health', () => {
  it('aceita resposta válida e rejeita server_time fora de ISO', () => {
    const ok = {
      status: 'ok',
      service: 'bella-api',
      version: '0.0.1',
      uptime_seconds: 3,
      server_time: new Date().toISOString(),
    };
    expect(healthResponseSchema.safeParse(ok).success).toBe(true);
    expect(healthResponseSchema.safeParse({ ...ok, server_time: 'ontem' }).success).toBe(false);
  });
});
