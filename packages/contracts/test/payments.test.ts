import { describe, expect, it } from 'vitest';
import { createPaymentSchema } from '../src/payments';

describe('createPaymentSchema — troco só existe em dinheiro', () => {
  it('aceita cartão/PIX sem tenderedCents', () => {
    const result = createPaymentSchema.safeParse({ method: 'credit', amountCents: 5_000 });
    expect(result.success).toBe(true);
  });

  it('rejeita tenderedCents em método não-dinheiro', () => {
    const result = createPaymentSchema.safeParse({
      method: 'pix',
      amountCents: 5_000,
      tenderedCents: 5_000,
    });
    expect(result.success).toBe(false);
  });

  it('exige tenderedCents em dinheiro', () => {
    const result = createPaymentSchema.safeParse({ method: 'cash', amountCents: 5_000 });
    expect(result.success).toBe(false);
  });

  it('rejeita tenderedCents menor que amountCents em dinheiro', () => {
    const result = createPaymentSchema.safeParse({
      method: 'cash',
      amountCents: 5_000,
      tenderedCents: 4_999,
    });
    expect(result.success).toBe(false);
  });

  it('aceita dinheiro com troco', () => {
    const result = createPaymentSchema.safeParse({
      method: 'cash',
      amountCents: 5_000,
      tenderedCents: 10_000,
    });
    expect(result.success).toBe(true);
  });

  it('aceita dinheiro exato (tenderedCents == amountCents)', () => {
    const result = createPaymentSchema.safeParse({
      method: 'cash',
      amountCents: 5_000,
      tenderedCents: 5_000,
    });
    expect(result.success).toBe(true);
  });
});
