/**
 * Dinheiro no Bella OS é SEMPRE um inteiro em centavos (ADR-002).
 * Nenhum float entra ou sai deste módulo. Toda soma, proporção e arredondamento
 * financeiro do sistema deve passar por aqui — nunca reimplementar em outro lugar.
 */

export type Cents = number;

const MAX_SAFE_CENTS = Number.MAX_SAFE_INTEGER;

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

/** Garante que o valor é um inteiro seguro. Lança MoneyError caso contrário. */
export function assertCents(value: unknown, label = 'valor'): Cents {
  if (typeof value !== 'number' || !Number.isInteger(value) || Math.abs(value) > MAX_SAFE_CENTS) {
    throw new MoneyError(`${label} deve ser um inteiro em centavos; recebido: ${String(value)}`);
  }
  return value;
}

export function addCents(...values: Cents[]): Cents {
  return values.reduce<Cents>((acc, v) => acc + assertCents(v), 0);
}

/**
 * Arredondamento half-even (banker's rounding) de uma divisão inteira numerador/denominador.
 * Determinístico, sem ponto flutuante. Funciona para negativos.
 */
export function divideRoundHalfEven(numerator: number, denominator: number): Cents {
  assertCents(numerator, 'numerador');
  assertCents(denominator, 'denominador');
  if (denominator === 0) throw new MoneyError('divisão por zero');
  const sign = Math.sign(numerator) * Math.sign(denominator) || 1;
  const n = Math.abs(numerator);
  const d = Math.abs(denominator);
  const q = Math.floor(n / d);
  const r = n - q * d;
  const twice = r * 2;
  let result = q;
  if (twice > d) result = q + 1;
  else if (twice === d) result = q % 2 === 0 ? q : q + 1;
  return sign * result;
}

/**
 * Aplica uma taxa em basis points (1 bps = 0,01%). 1000 bps = 10%.
 * Ex.: taxa de serviço de 10% sobre R$ 84,50 → applyBps(8450, 1000) = 845.
 */
export function applyBps(amount: Cents, bps: number): Cents {
  assertCents(amount, 'amount');
  assertCents(bps, 'bps');
  return divideRoundHalfEven(amount * bps, 10_000);
}

/**
 * Divide um total em `parts` parcelas inteiras cuja soma é exatamente o total.
 * Os centavos residuais vão para as primeiras parcelas (determinístico).
 */
export function splitEvenly(total: Cents, parts: number): Cents[] {
  assertCents(total, 'total');
  if (!Number.isInteger(parts) || parts < 1) throw new MoneyError('parts deve ser inteiro >= 1');
  const sign = total < 0 ? -1 : 1;
  const abs = Math.abs(total);
  const base = Math.floor(abs / parts);
  const remainder = abs - base * parts;
  return Array.from({ length: parts }, (_, i) => sign * (base + (i < remainder ? 1 : 0)));
}

/**
 * Distribui `total` proporcionalmente a `weights` (método do maior resto).
 * Soma das parcelas == total. Pesos zero recebem zero. Usado em rateio de desconto/taxa por item.
 */
export function allocateProportionally(total: Cents, weights: number[]): Cents[] {
  assertCents(total, 'total');
  if (weights.length === 0) throw new MoneyError('weights não pode ser vazio');
  for (const w of weights) {
    if (!Number.isInteger(w) || w < 0) throw new MoneyError('weights devem ser inteiros >= 0');
  }
  const weightSum = weights.reduce((a, b) => a + b, 0);
  if (weightSum === 0) {
    if (total !== 0) {
      throw new MoneyError('não é possível ratear total não nulo com pesos todos zero');
    }
    return weights.map(() => 0);
  }
  const sign = total < 0 ? -1 : 1;
  const abs = Math.abs(total);
  const floors = weights.map((w) => Math.floor((abs * w) / weightSum));
  const remainders = weights.map((w, i) => ({ i, r: abs * w - floors[i]! * weightSum }));
  let leftover = abs - floors.reduce((a, b) => a + b, 0);
  remainders.sort((a, b) => b.r - a.r || a.i - b.i);
  const result = [...floors];
  for (const { i } of remainders) {
    if (leftover === 0) break;
    result[i] = result[i]! + 1;
    leftover -= 1;
  }
  return result.map((v) => sign * v);
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** 123456 → "R$ 1.234,56" (com espaço não separável após R$, como o Intl produz). */
export function formatBRL(cents: Cents): string {
  assertCents(cents);
  return brl.format(cents / 100);
}

/**
 * Converte entrada humana ("1.234,56", "12,5", "R$ 7", "7.50") em centavos.
 * Regra: se houver vírgula, ela é o separador decimal e pontos são milhar.
 * Sem vírgula e com exatamente um ponto seguido de 1–2 dígitos, o ponto é decimal.
 * Retorna null para entrada inválida — nunca lança em input de usuário.
 */
export function parseBRL(input: string): Cents | null {
  // \s cobre espaço comum e os espaços não separáveis que o Intl usa após "R$".
  const cleaned = input.replace(/R\$/gi, '').replace(/\s/g, '');
  if (cleaned === '' || !/^-?[\d.,]+$/.test(cleaned)) return null;
  const negative = cleaned.startsWith('-');
  const body = negative ? cleaned.slice(1) : cleaned;
  let integerPart: string;
  let decimalPart: string;
  if (body.includes(',')) {
    const pieces = body.split(',');
    if (pieces.length !== 2) return null;
    integerPart = pieces[0]!.replace(/\./g, '');
    decimalPart = pieces[1]!;
  } else if (/^\d+\.\d{1,2}$/.test(body)) {
    const [i, d] = body.split('.') as [string, string];
    integerPart = i;
    decimalPart = d;
  } else {
    integerPart = body.replace(/\./g, '');
    decimalPart = '';
  }
  if (!/^\d*$/.test(integerPart) || !/^\d{0,2}$/.test(decimalPart)) return null;
  if (integerPart === '' && decimalPart === '') return null;
  const cents = Number(integerPart || '0') * 100 + Number(decimalPart.padEnd(2, '0') || '0');
  if (!Number.isSafeInteger(cents)) return null;
  return negative ? -cents : cents;
}
