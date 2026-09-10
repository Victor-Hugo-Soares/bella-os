import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Db } from '@bella/db';
import { resolveDeviceActor, type DeviceActor } from './service';

declare module 'fastify' {
  interface FastifyRequest {
    deviceActor?: DeviceActor;
  }
}

const DEVICE_TOKEN_HEADER = 'x-device-token';

/**
 * Autentica um dispositivo (KDS/caixa) pelo token de longa duração — nunca uma sessão
 * de staff. Usado em rotas que representam ações do próprio dispositivo (ex.: verificar
 * PIN de operador). 401 sem token ou token inválido/revogado.
 *
 * Aceita o token também via `?deviceToken=` (só quando o header não vem) — o
 * `EventSource` do browser (M9, `GET /v1/stream`) não permite headers customizados,
 * então essa é a única forma de autenticar essa conexão específica. Aceito como
 * tradeoff: o token de dispositivo já é de baixo risco relativo (revogável a
 * qualquer momento, ADR-025) e a conexão roda na rede local do restaurante.
 */
export function requireDevice(db: Db) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const header = request.headers[DEVICE_TOKEN_HEADER];
    const fromHeader = Array.isArray(header) ? header[0] : header;
    const query = request.query as Record<string, unknown> | undefined;
    const fromQuery = typeof query?.deviceToken === 'string' ? query.deviceToken : undefined;
    const actor = await resolveDeviceActor(db, fromHeader ?? fromQuery);
    request.deviceActor = actor;
  };
}
