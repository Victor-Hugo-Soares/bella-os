import { hash, verify } from '@node-rs/argon2';

// `Algorithm` é um `const enum` — inacessível com `verbatimModuleSyntax` (tsconfig do
// projeto). Usamos o valor numérico direto, confirmado no .d.ts instalado:
// `Algorithm.Argon2id = 2` (node_modules/@node-rs/argon2/index.d.ts).
const ARGON2ID = 2;

/**
 * PIN de operador (M3, DOMAIN_MODEL.md `memberships.pin_hash`). Baixa entropia
 * (4–6 dígitos) DE PROPÓSITO — é um segundo fator sobre um dispositivo já autenticado,
 * nunca um segredo sozinho (ACTIVE_PLAN.md M3). Por ser baixa entropia, o hash precisa
 * ser LENTO (argon2id) para tornar inviável testar todas as combinações caso o hash
 * vaze — o oposto do token de dispositivo (alta entropia, hash rápido, ver
 * device-token.ts). Biblioteca `@node-rs/argon2` escolhida por ter binário
 * pré-compilado para Windows/Linux (confirmado rodando de verdade nesta máquina antes
 * de escrever este código — regra 12 do CLAUDE.md), evitando depender de compilador
 * nativo em dev ou CI.
 */

const PIN_RE = /^\d{4,6}$/;

export function isValidPinFormat(pin: string): boolean {
  return PIN_RE.test(pin);
}

export async function hashPin(pin: string): Promise<string> {
  if (!isValidPinFormat(pin)) {
    throw new Error('PIN deve ter de 4 a 6 dígitos numéricos.');
  }
  return hash(pin, { algorithm: ARGON2ID });
}

/** Nunca lança em PIN mal formado — apenas nega (a UI já valida o formato antes). */
export async function verifyPin(pinHash: string, pin: string): Promise<boolean> {
  if (!isValidPinFormat(pin)) return false;
  try {
    return await verify(pinHash, pin);
  } catch {
    return false;
  }
}
