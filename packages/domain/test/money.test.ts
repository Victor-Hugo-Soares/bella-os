import { describe, expect, it } from 'vitest';
import {
  MoneyError,
  addCents,
  allocateProportionally,
  applyBps,
  assertCents,
  divideRoundHalfEven,
  formatBRL,
  parseBRL,
  splitEvenly,
} from '../src/money';

describe('assertCents', () => {
  it('aceita inteiros e rejeita floats, strings e NaN', () => {
    expect(assertCents(0)).toBe(0);
    expect(assertCents(-150)).toBe(-150);
    expect(() => assertCents(1.5)).toThrow(MoneyError);
    expect(() => assertCents('10')).toThrow(MoneyError);
    expect(() => assertCents(Number.NaN)).toThrow(MoneyError);
  });
});

describe('divideRoundHalfEven', () => {
  it('arredonda para o par em empates', () => {
    expect(divideRoundHalfEven(5, 2)).toBe(2); // 2.5 → 2
    expect(divideRoundHalfEven(7, 2)).toBe(4); // 3.5 → 4
    expect(divideRoundHalfEven(-5, 2)).toBe(-2);
    expect(divideRoundHalfEven(-7, 2)).toBe(-4);
  });
  it('arredonda normalmente fora de empates', () => {
    expect(divideRoundHalfEven(10, 3)).toBe(3);
    expect(divideRoundHalfEven(20, 3)).toBe(7);
  });
  it('rejeita divisão por zero', () => {
    expect(() => divideRoundHalfEven(1, 0)).toThrow(MoneyError);
  });
});

describe('applyBps (taxa de serviço, descontos percentuais)', () => {
  it('10% de R$ 84,50 = R$ 8,45', () => {
    expect(applyBps(8450, 1000)).toBe(845);
  });
  it('casos de centavo com half-even', () => {
    expect(applyBps(5, 1000)).toBe(0); // 0.5 → 0
    expect(applyBps(15, 1000)).toBe(2); // 1.5 → 2
    expect(applyBps(25, 1000)).toBe(2); // 2.5 → 2
  });
  it('0 bps é zero e 10000 bps é o próprio valor', () => {
    expect(applyBps(12345, 0)).toBe(0);
    expect(applyBps(12345, 10_000)).toBe(12345);
  });
});

describe('splitEvenly (dividir conta por igual)', () => {
  it('soma das parcelas é exatamente o total e residual vai para as primeiras', () => {
    expect(splitEvenly(10_000, 3)).toEqual([3334, 3333, 3333]);
    expect(splitEvenly(100, 3).reduce((a, b) => a + b, 0)).toBe(100);
    expect(splitEvenly(-100, 3)).toEqual([-34, -33, -33]);
  });
  it('propriedade: soma == total e diferença máxima de 1 centavo', () => {
    for (let total = 0; total < 500; total += 7) {
      for (let parts = 1; parts <= 9; parts++) {
        const result = splitEvenly(total, parts);
        expect(result).toHaveLength(parts);
        expect(result.reduce((a, b) => a + b, 0)).toBe(total);
        expect(Math.max(...result) - Math.min(...result)).toBeLessThanOrEqual(1);
      }
    }
  });
  it('rejeita partes inválidas', () => {
    expect(() => splitEvenly(100, 0)).toThrow(MoneyError);
    expect(() => splitEvenly(100, 1.5)).toThrow(MoneyError);
  });
});

describe('allocateProportionally (rateio por item)', () => {
  it('soma exatamente o total (maior resto)', () => {
    expect(allocateProportionally(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocateProportionally(1000, [2500, 1500, 1000])).toEqual([500, 300, 200]);
  });
  it('peso zero recebe zero; total zero com pesos zero é permitido', () => {
    expect(allocateProportionally(100, [0, 1])).toEqual([0, 100]);
    expect(allocateProportionally(0, [0, 0])).toEqual([0, 0]);
    expect(() => allocateProportionally(10, [0, 0])).toThrow(MoneyError);
  });
  it('propriedade: soma == total para pesos pseudoaleatórios determinísticos', () => {
    let seed = 42;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) % 500;
    for (let k = 0; k < 200; k++) {
      const weights: number[] = Array.from({ length: 1 + (k % 6) }, rnd);
      if (weights.reduce((a, b) => a + b, 0) === 0) weights[0] = 1;
      const total = rnd() * 3;
      const parts = allocateProportionally(total, weights);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
      expect(parts.every((p) => p >= 0)).toBe(true);
    }
  });
});

describe('formatBRL / parseBRL', () => {
  it('formata com separadores brasileiros (normalizando o espaço não separável)', () => {
    expect(formatBRL(123456).replace(/\s/g, ' ')).toBe('R$ 1.234,56');
    expect(formatBRL(0).replace(/\s/g, ' ')).toBe('R$ 0,00');
  });
  it('interpreta entradas humanas comuns do caixa', () => {
    expect(parseBRL('1.234,56')).toBe(123456);
    expect(parseBRL('12,5')).toBe(1250);
    expect(parseBRL('R$ 7')).toBe(700);
    expect(parseBRL('7.50')).toBe(750);
    expect(parseBRL('1.000')).toBe(100000);
    expect(parseBRL('-3,00')).toBe(-300);
  });
  it('devolve null para lixo, nunca lança', () => {
    expect(parseBRL('')).toBeNull();
    expect(parseBRL('abc')).toBeNull();
    expect(parseBRL('1,2,3')).toBeNull();
    expect(parseBRL('1,234')).toBeNull();
  });
  it('round-trip: format → parse devolve o mesmo valor', () => {
    for (const c of [0, 1, 99, 100, 12345, 999999, 100000000]) {
      expect(parseBRL(formatBRL(c))).toBe(c);
    }
  });
});

describe('addCents', () => {
  it('soma inteiros e rejeita floats', () => {
    expect(addCents(100, 250, -50)).toBe(300);
    expect(() => addCents(100, 0.1)).toThrow(MoneyError);
  });
});
