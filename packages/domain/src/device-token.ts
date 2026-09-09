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
