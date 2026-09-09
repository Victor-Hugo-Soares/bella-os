import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from '@bella/db';
import { AppError } from '../../../lib/errors';
import type { Auth } from '../auth';
import { requireAnySession, requirePermission } from '../require-permission';
import { requireDevice } from './require-device';
import {
  createPairingCode,
  exchangePairingCode,
  listDevices,
  revokeDevice,
  setMembershipPin,
  verifyMembershipPin,
} from './service';

export interface DeviceRoutesDeps {
  db: Db;
  auth: Auth;
}

const createPairingCodeBody = z.object({
  deviceKind: z.enum(['kds', 'cashier', 'floor', 'admin']),
  deviceName: z.string().min(1).max(100),
});

const exchangeBody = z.object({
  code: z.string().regex(/^\d{6}$/, 'código deve ter 6 dígitos'),
});

const setPinBody = z.object({
  pin: z.string().regex(/^\d{4,6}$/, 'PIN deve ter de 4 a 6 dígitos'),
});

const verifyPinBody = z.object({
  membershipId: z.uuid(),
  pin: z.string().regex(/^\d{4,6}$/, 'PIN deve ter de 4 a 6 dígitos'),
});

function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AppError('VALIDATION_ERROR', result.error.issues.map((i) => i.message).join('; '));
  }
  return result.data;
}

/**
 * Pareamento de dispositivo (M3, ACTIVE_PLAN.md): um gerente autenticado gera um
 * código; o próprio dispositivo — sem nenhuma credencial ainda — troca esse código por
 * um token de longa duração. `/exchange` é a única rota deste módulo genuinamente
 * pública (o dispositivo não tem sessão nem token antes de trocar o código).
 */
export async function deviceRoutes(app: FastifyInstance, deps: DeviceRoutesDeps): Promise<void> {
  const { db, auth } = deps;

  app.post(
    '/v1/devices/pairing-codes',
    { preHandler: requirePermission(db, auth, 'devices.manage') },
    async (request) => {
      const body = parseOrThrow(createPairingCodeBody, request.body);
      const actor = request.actor!;
      const result = await createPairingCode(db, {
        tenantId: actor.tenantId,
        createdByMembershipId: actor.membershipId,
        deviceKind: body.deviceKind,
        deviceName: body.deviceName,
      });
      return { code: result.code, expiresAt: result.expiresAt.toISOString() };
    },
  );

  app.post('/v1/devices/exchange', async (request, reply) => {
    const body = parseOrThrow(exchangeBody, request.body);
    const result = await exchangePairingCode(db, body.code);
    reply.status(201);
    return { token: result.token, deviceId: result.deviceId };
  });

  app.get(
    '/v1/devices',
    { preHandler: requirePermission(db, auth, 'devices.manage') },
    async (request) => {
      const actor = request.actor!;
      const devices = await listDevices(db, actor.tenantId);
      return {
        devices: devices.map((d) => ({
          ...d,
          lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
          revokedAt: d.revokedAt?.toISOString() ?? null,
          createdAt: d.createdAt.toISOString(),
        })),
      };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/v1/devices/:id/revoke',
    { preHandler: requirePermission(db, auth, 'devices.manage') },
    async (request) => {
      const actor = request.actor!;
      await revokeDevice(db, actor.tenantId, request.params.id);
      return { revoked: true };
    },
  );

  app.post('/v1/me/pin', { preHandler: requireAnySession(db, auth) }, async (request) => {
    const body = parseOrThrow(setPinBody, request.body);
    const actor = request.actor!;
    await setMembershipPin(db, actor.tenantId, actor.membershipId, body.pin);
    return { ok: true };
  });

  app.post('/v1/devices/pin/verify', { preHandler: requireDevice(db) }, async (request) => {
    const body = parseOrThrow(verifyPinBody, request.body);
    const device = request.deviceActor!;
    const result = await verifyMembershipPin(db, device.tenantId, body.membershipId, body.pin);
    return result;
  });
}
