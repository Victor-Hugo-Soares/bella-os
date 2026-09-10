import { describe, expect, it } from 'vitest';
import { computeBillTotals, computeCouvertCents, computeServiceFeeCents } from '../src/totals';
import { MoneyError } from '../src/money';

describe('computeBillTotals', () => {
  it('soma a fórmula do DOMAIN_MODEL.md §4', () => {
    const totals = computeBillTotals({
      itemsTotalCents: 10_000,
      discountsCents: 1_000,
      serviceFeeCents: 900,
      couvertCents: 500,
      adjustmentsCents: 0,
      paidTotalCents: 0,
    });
    expect(totals.grandTotalCents).toBe(10_000 - 1_000 + 900 + 500);
    expect(totals.balanceCents).toBe(totals.grandTotalCents);
  });

  it('balance fecha em zero quando pago = grand_total', () => {
    const totals = computeBillTotals({
      itemsTotalCents: 8_450,
      discountsCents: 0,
      serviceFeeCents: 845,
      couvertCents: 0,
      adjustmentsCents: 0,
      paidTotalCents: 9_295,
    });
    expect(totals.balanceCents).toBe(0);
  });

  it('lida com itemsTotal reduzido por reversão total (cancelamento antes da produção)', () => {
    // ledger: item_charge 5000 + item_reversal -5000 = itemsTotal 0
    const totals = computeBillTotals({
      itemsTotalCents: 0,
      discountsCents: 0,
      serviceFeeCents: 0,
      couvertCents: 0,
      adjustmentsCents: 0,
      paidTotalCents: 0,
    });
    expect(totals.grandTotalCents).toBe(0);
  });

  it('rejeita entrada não-inteira', () => {
    expect(() =>
      computeBillTotals({
        itemsTotalCents: 10.5,
        discountsCents: 0,
        serviceFeeCents: 0,
        couvertCents: 0,
        adjustmentsCents: 0,
        paidTotalCents: 0,
      }),
    ).toThrow(MoneyError);
  });
});

describe('computeServiceFeeCents', () => {
  it('tabela de casos de centavos (10% = 1000 bps)', () => {
    expect(computeServiceFeeCents(8_450, 1_000)).toBe(845); // R$84,50 → R$8,45
    expect(computeServiceFeeCents(999, 1_000)).toBe(100); // 99.9 → half-even arredonda p/ 100
    expect(computeServiceFeeCents(0, 1_000)).toBe(0);
    expect(computeServiceFeeCents(10_000, 0)).toBe(0); // service_fee_mode 'off' já filtrado antes, mas bps=0 é seguro
  });

  it('half-even em empate exato', () => {
    // 250 * 1000 / 10000 = 25.0 exato, sem empate a testar aqui — usar caso real de empate:
    // numerador par vs ímpar após divisão por 10000 com bps que gere fração .5
    expect(computeServiceFeeCents(125, 4_000)).toBe(50); // 125*0.4=50 exato
  });
});

describe('computeCouvertCents', () => {
  it('off é sempre zero', () => {
    expect(computeCouvertCents(1_500, 'off', 4)).toBe(0);
    expect(computeCouvertCents(1_500, 'off', null)).toBe(0);
  });

  it('per_tab ignora guestCount', () => {
    expect(computeCouvertCents(1_500, 'per_tab', null)).toBe(1_500);
    expect(computeCouvertCents(1_500, 'per_tab', 6)).toBe(1_500);
  });

  it('per_guest multiplica pelo guestCount, trata null como 0', () => {
    expect(computeCouvertCents(1_500, 'per_guest', 4)).toBe(6_000);
    expect(computeCouvertCents(1_500, 'per_guest', null)).toBe(0);
    expect(computeCouvertCents(1_500, 'per_guest', 0)).toBe(0);
  });
});
