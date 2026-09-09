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
 */
export function requireDevice(db: Db) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const header = request.headers[DEVICE_TOKEN_HEADER];
    const token = Array.isArray(header) ? header[0] : header;
    const actor = await resolveDeviceActor(db, token);
    request.deviceActor = actor;
  };
}
