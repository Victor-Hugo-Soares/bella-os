import { describe, expect, it } from 'vitest';
import { generateDeviceToken, generatePairingCode, hashDeviceToken } from '../src/device-token';

describe('generateDeviceToken', () => {
  it('gera tokens únicos e razoavelmente longos (alta entropia)', () => {
    const tokens = Array.from({ length: 50 }, () => generateDeviceToken());
    expect(new Set(tokens).size).toBe(50);
    for (const t of tokens) expect(t.length).toBeGreaterThanOrEqual(32);
  });
});

describe('hashDeviceToken', () => {
  it('é determinístico (mesmo token → mesmo hash, ao contrário do PIN)', () => {
    const token = generateDeviceToken();
    expect(hashDeviceToken(token)).toBe(hashDeviceToken(token));
  });

  it('tokens diferentes produzem hashes diferentes', () => {
    const a = generateDeviceToken();
    const b = generateDeviceToken();
    expect(hashDeviceToken(a)).not.toBe(hashDeviceToken(b));
  });

  it('produz um hex de 64 caracteres (sha-256)', () => {
    expect(hashDeviceToken('x')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('generatePairingCode', () => {
  it('sempre gera 6 dígitos, com zero à esquerda quando necessário', () => {
    for (let i = 0; i < 200; i++) {
      const code = generatePairingCode();
      expect(code).toMatch(/^\d{6}$/);
    }
  });

  it('gera valores variados (não é uma constante)', () => {
    const codes = new Set(Array.from({ length: 100 }, () => generatePairingCode()));
    expect(codes.size).toBeGreaterThan(50);
  });
});
