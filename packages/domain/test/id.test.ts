import { describe, expect, it } from 'vitest';
import { isUuid, newId } from '../src/id';

describe('newId / isUuid', () => {
  it('gera um UUID válido e reconhecível por isUuid', () => {
    const id = newId();
    expect(isUuid(id)).toBe(true);
  });

  it('gera IDs únicos e ordenáveis por tempo (UUID v7: prefixo crescente)', () => {
    const ids = Array.from({ length: 20 }, () => newId());
    expect(new Set(ids).size).toBe(20);
    const sorted = [...ids].sort();
    expect(sorted).toEqual(ids); // já nasce em ordem, por ser v7
  });

  it('isUuid rejeita valores que não são UUID', () => {
    expect(isUuid('nao-e-uuid')).toBe(false);
    expect(isUuid(123)).toBe(false);
    expect(isUuid(null)).toBe(false);
    expect(isUuid('11111111-1111-4111-8111-11111111111')).toBe(false); // curto
  });
});
