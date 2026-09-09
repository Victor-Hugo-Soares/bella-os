import { describe, expect, it } from 'vitest';
import { hashPin, isValidPinFormat, verifyPin } from '../src/pin';

describe('isValidPinFormat', () => {
  it('aceita 4 a 6 dígitos', () => {
    expect(isValidPinFormat('1234')).toBe(true);
    expect(isValidPinFormat('123456')).toBe(true);
  });
  it('rejeita formatos inválidos', () => {
    expect(isValidPinFormat('123')).toBe(false);
    expect(isValidPinFormat('1234567')).toBe(false);
    expect(isValidPinFormat('12a4')).toBe(false);
    expect(isValidPinFormat('')).toBe(false);
  });
});

describe('hashPin / verifyPin', () => {
  it('hash de um PIN válido pode ser verificado com o mesmo PIN', async () => {
    const hash = await hashPin('4321');
    expect(await verifyPin(hash, '4321')).toBe(true);
  });

  it('PIN errado não verifica', async () => {
    const hash = await hashPin('4321');
    expect(await verifyPin(hash, '9999')).toBe(false);
  });

  it('rejeita gerar hash de PIN mal formado', async () => {
    await expect(hashPin('12')).rejects.toThrow(/4 a 6 dígitos/);
  });

  it('verifyPin nunca lança para PIN mal formado — só nega', async () => {
    const hash = await hashPin('4321');
    await expect(verifyPin(hash, 'abcd')).resolves.toBe(false);
    await expect(verifyPin(hash, '')).resolves.toBe(false);
  });

  it('dois hashes do mesmo PIN são diferentes (salt aleatório)', async () => {
    const a = await hashPin('123456');
    const b = await hashPin('123456');
    expect(a).not.toBe(b);
    expect(await verifyPin(a, '123456')).toBe(true);
    expect(await verifyPin(b, '123456')).toBe(true);
  });
});
