import { and, eq, isNull } from 'drizzle-orm';
import type { Db } from '@bella/db';
import { schema, withoutTenant, withTenant } from '@bella/db';
import {
  generateDeviceToken,
  generatePairingCode,
  hashDeviceToken,
  hashPin,
  newId,
  verifyPin,
} from '@bella/domain';
import { AppError } from '../../../lib/errors';

const PAIRING_CODE_TTL_MINUTES = 10;
const PAIRING_CODE_MAX_ATTEMPTS = 5;

export interface CreatePairingCodeInput {
  tenantId: string;
  createdByMembershipId: string;
  deviceKind: 'kds' | 'cashier' | 'floor' | 'admin';
  deviceName: string;
}

export interface PairingCode {
  code: string;
  expiresAt: Date;
}

/**
 * Cria um código de pareamento de 6 dígitos. `pairing_codes` não tem RLS (ADR-025 —
 * o dispositivo que vai trocar o código ainda não tem tenant conhecido), então o
 * isolamento é garantido aqui, na aplicação: o `tenantId` vem do ator autenticado
 * (`requirePermission`), nunca de entrada do cliente.
 */
export async function createPairingCode(
  db: Db,
  input: CreatePairingCodeInput,
): Promise<PairingCode> {
  const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MINUTES * 60_000);

  for (let attempt = 0; attempt < PAIRING_CODE_MAX_ATTEMPTS; attempt++) {
    const code = generatePairingCode();
    try {
      await withoutTenant(db, (tx) =>
        tx.insert(schema.pairingCodes).values({
          id: newId(),
          tenantId: input.tenantId,
          code,
          deviceKind: input.deviceKind,
          deviceName: input.deviceName,
          expiresAt,
          createdByMembershipId: input.createdByMembershipId,
        }),
      );
      return { code, expiresAt };
    } catch (err) {
      // Colisão com outro código ainda não consumido (índice único parcial) — muito
      // raro (espaço de 1.000.000), mas tratado com retry em vez de deixar vazar.
      const message = err instanceof Error ? String(err.cause ?? err.message) : String(err);
      if (!/duplicate key|unique/i.test(message)) throw err;
    }
  }
  throw new AppError('INTERNAL_ERROR', 'Não foi possível gerar um código de pareamento único.');
}

export interface ExchangeResult {
  token: string;
  deviceId: string;
  tenantId: string;
}

/**
 * Troca um código de pareamento válido por um token de dispositivo de longa duração.
 * Público de propósito (o dispositivo ainda não tem nenhuma credencial) — a segurança
 * vem do código ser de uso único, curto prazo (10 min) e o espaço de busca (1M) tornar
 * adivinhação impraticável dentro da janela. Tudo numa transação: marcar o código como
 * usado e criar o dispositivo, ou nenhum dos dois.
 */
export async function exchangePairingCode(db: Db, code: string): Promise<ExchangeResult> {
  return withoutTenant(db, async (tx) => {
    const rows = await tx
      .select()
      .from(schema.pairingCodes)
      .where(and(eq(schema.pairingCodes.code, code), isNull(schema.pairingCodes.usedAt)))
      .for('update');
    const pairing = rows[0];
    if (!pairing) {
      throw new AppError('NOT_FOUND', 'Código de pareamento inválido ou já utilizado.');
    }
    if (pairing.expiresAt.getTime() <= Date.now()) {
      throw new AppError('NOT_FOUND', 'Código de pareamento expirado.');
    }

    const token = generateDeviceToken();
    const deviceId = newId();
    await tx
      .update(schema.pairingCodes)
      .set({ usedAt: new Date() })
      .where(eq(schema.pairingCodes.id, pairing.id));
    await tx.insert(schema.devices).values({
      id: deviceId,
      tenantId: pairing.tenantId,
      name: pairing.deviceName,
      kind: pairing.deviceKind,
      tokenHash: hashDeviceToken(token),
    });

    return { token, deviceId, tenantId: pairing.tenantId };
  });
}

export interface DeviceSummary {
  id: string;
  name: string;
  kind: string;
  lastSeenAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

/** Filtra por `tenantId` na aplicação — `devices` não tem RLS (ADR-025). */
export async function listDevices(db: Db, tenantId: string): Promise<DeviceSummary[]> {
  return withoutTenant(db, (tx) =>
    tx
      .select({
        id: schema.devices.id,
        name: schema.devices.name,
        kind: schema.devices.kind,
        lastSeenAt: schema.devices.lastSeenAt,
        revokedAt: schema.devices.revokedAt,
        createdAt: schema.devices.createdAt,
      })
      .from(schema.devices)
      .where(eq(schema.devices.tenantId, tenantId)),
  );
}

export async function revokeDevice(db: Db, tenantId: string, deviceId: string): Promise<void> {
  const result = await withoutTenant(db, (tx) =>
    tx
      .update(schema.devices)
      .set({ revokedAt: new Date() })
      .where(and(eq(schema.devices.id, deviceId), eq(schema.devices.tenantId, tenantId)))
      .returning({ id: schema.devices.id }),
  );
  if (result.length === 0) {
    throw new AppError('NOT_FOUND', 'Dispositivo não encontrado neste tenant.');
  }
}

export interface DeviceActor {
  type: 'device';
  deviceId: string;
  tenantId: string;
  kind: string;
}

/**
 * Resolve o ator a partir do token bruto (`X-Device-Token`). Busca sem contexto de
 * tenant de propósito — é exatamente o problema que `devices` sem RLS resolve (ADR-025):
 * ainda não sabemos o tenant até achar o dispositivo pelo hash do token.
 */
export async function resolveDeviceActor(
  db: Db,
  rawToken: string | undefined,
): Promise<DeviceActor> {
  if (!rawToken) {
    throw new AppError('UNAUTHENTICATED', 'Token de dispositivo ausente.');
  }
  const tokenHash = hashDeviceToken(rawToken);
  const rows = await withoutTenant(db, (tx) =>
    tx.select().from(schema.devices).where(eq(schema.devices.tokenHash, tokenHash)),
  );
  const device = rows[0];
  if (!device || device.revokedAt) {
    // Mesma resposta para "não existe" e "revogado" — não vaza qual dos dois.
    throw new AppError('UNAUTHENTICATED', 'Token de dispositivo inválido ou revogado.');
  }

  await withoutTenant(db, (tx) =>
    tx
      .update(schema.devices)
      .set({ lastSeenAt: new Date() })
      .where(eq(schema.devices.id, device.id)),
  );

  return { type: 'device', deviceId: device.id, tenantId: device.tenantId, kind: device.kind };
}

const PIN_MAX_ATTEMPTS = 5;
const PIN_LOCKOUT_MINUTES = 15;

export interface PinVerificationResult {
  membershipId: string;
  userId: string;
  roleId: string;
}

/**
 * Confirma a identidade de um operador via PIN, num dispositivo já autenticado
 * (ACTIVE_PLAN.md M3: PIN é segundo fator, nunca sozinho). Bloqueia depois de
 * `PIN_MAX_ATTEMPTS` tentativas erradas por `PIN_LOCKOUT_MINUTES` — campos já existiam
 * em `memberships` desde o M1.
 */
export async function verifyMembershipPin(
  db: Db,
  tenantId: string,
  membershipId: string,
  pin: string,
): Promise<PinVerificationResult> {
  return withTenant(db, tenantId, async (tx) => {
    const rows = await tx
      .select()
      .from(schema.memberships)
      .where(eq(schema.memberships.id, membershipId))
      .for('update');
    const membership = rows[0];
    if (!membership || membership.status !== 'active') {
      throw new AppError('PERMISSION_DENIED', 'Membership inexistente ou inativo.');
    }
    if (membership.pinLockedUntil && membership.pinLockedUntil.getTime() > Date.now()) {
      throw new AppError(
        'PERMISSION_DENIED',
        'PIN bloqueado temporariamente após tentativas incorretas.',
      );
    }
    if (!membership.pinHash) {
      throw new AppError('PERMISSION_DENIED', 'PIN não configurado para este usuário.');
    }

    const ok = await verifyPin(membership.pinHash, pin);
    if (!ok) {
      const attempts = membership.pinFailedAttempts + 1;
      const lockedUntil =
        attempts >= PIN_MAX_ATTEMPTS ? new Date(Date.now() + PIN_LOCKOUT_MINUTES * 60_000) : null;
      await tx
        .update(schema.memberships)
        .set({ pinFailedAttempts: attempts, pinLockedUntil: lockedUntil })
        .where(eq(schema.memberships.id, membershipId));
      throw new AppError('PERMISSION_DENIED', 'PIN incorreto.');
    }

    await tx
      .update(schema.memberships)
      .set({ pinFailedAttempts: 0, pinLockedUntil: null })
      .where(eq(schema.memberships.id, membershipId));

    return { membershipId: membership.id, userId: membership.userId, roleId: membership.roleId };
  });
}

/** Define/troca o PIN do próprio membership (self-service, ver routes.ts). */
export async function setMembershipPin(
  db: Db,
  tenantId: string,
  membershipId: string,
  pin: string,
): Promise<void> {
  const pinHash = await hashPin(pin);
  await withTenant(db, tenantId, (tx) =>
    tx
      .update(schema.memberships)
      .set({ pinHash, pinFailedAttempts: 0, pinLockedUntil: null })
      .where(eq(schema.memberships.id, membershipId)),
  );
}
