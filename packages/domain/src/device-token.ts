import { createHash, randomBytes, randomInt } from 'node:crypto';

/**
 * Token de dispositivo (M3): alta entropia, gerado por nós — diferente do PIN humano
 * (pin.ts), um hash RÁPIDO e determinístico é apropriado aqui, porque o espaço de
 * busca (2^256) já torna inviável adivinhar o token mesmo com hash rápido; o que
 * importa é poder localizar o dispositivo por `WHERE token_hash = $1` sem varrer a
 * tabela. Nunca usar este padrão para segredo de baixa entropia (PIN, senha).
 */
export function generateDeviceToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashDeviceToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Código de pareamento: 6 dígitos, com zero à esquerda quando necessário. */
export function generatePairingCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/**
 * Código de mesa (`tables.qr_code`, M6): curto (para caber numa URL amigável no QR
 * físico) e NÃO sequencial (DOMAIN_MODEL.md §1.4) — um número de mesa sequencial
 * deixaria fácil adivinhar/escanear mesas vizinhas alterando a URL manualmente.
 * 6 bytes aleatórios em base64url ≈ 8 caracteres, espaço grande o suficiente para não
 * colidir num tenant com poucas dezenas de mesas (retry em colisão, mesmo padrão de
 * `generatePairingCode`/`createPairingCode`).
 */
export function generateTableCode(): string {
  return randomBytes(6).toString('base64url');
}
