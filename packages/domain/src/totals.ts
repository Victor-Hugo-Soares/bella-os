/**
 * Cálculo de totais da comanda (DOMAIN_MODEL.md §4, M12). Função pura: quem soma o
 * ledger e lê `tenant_settings` é o serviço da API — aqui só entra a aritmética,
 * testável sem banco.
 */
import { applyBps, assertCents, type Cents } from './money';

export interface BillTotalsInput {
  /** Já líquido de reversões: soma de `item_charge` + `item_reversal` do ledger. */
  itemsTotalCents: Cents;
  /** Magnitude positiva do total de descontos aplicados (não o sinal do ledger). */
  discountsCents: Cents;
  serviceFeeCents: Cents;
  couvertCents: Cents;
  adjustmentsCents: Cents;
  /** Magnitude positiva do total já pago. Sempre 0 até o M13. */
  paidTotalCents: Cents;
}

export interface BillTotals extends BillTotalsInput {
  grandTotalCents: Cents;
  balanceCents: Cents;
}

/** `grand_total = items_total − discounts + service_fee + couvert + adjustments`. */
export function computeBillTotals(input: BillTotalsInput): BillTotals {
  const itemsTotalCents = assertCents(input.itemsTotalCents, 'itemsTotalCents');
  const discountsCents = assertCents(input.discountsCents, 'discountsCents');
  const serviceFeeCents = assertCents(input.serviceFeeCents, 'serviceFeeCents');
  const couvertCents = assertCents(input.couvertCents, 'couvertCents');
  const adjustmentsCents = assertCents(input.adjustmentsCents, 'adjustmentsCents');
  const paidTotalCents = assertCents(input.paidTotalCents, 'paidTotalCents');

  const grandTotalCents =
    itemsTotalCents - discountsCents + serviceFeeCents + couvertCents + adjustmentsCents;
  const balanceCents = grandTotalCents - paidTotalCents;

  return {
    itemsTotalCents,
    discountsCents,
    serviceFeeCents,
    couvertCents,
    adjustmentsCents,
    paidTotalCents,
    grandTotalCents,
    balanceCents,
  };
}

/** `service_fee = round_half_even((items_total − discounts) × service_fee_bps / 10000)`. */
export function computeServiceFeeCents(netItemsTotalCents: Cents, serviceFeeBps: number): Cents {
  return applyBps(netItemsTotalCents, serviceFeeBps);
}

export type CouvertMode = 'off' | 'per_guest' | 'per_tab';

/** `couvert = couvert_cents × guest_count (per_guest) | couvert_cents (per_tab)`. */
export function computeCouvertCents(
  couvertCentsPerUnit: Cents,
  mode: CouvertMode,
  guestCount: number | null,
): Cents {
  assertCents(couvertCentsPerUnit, 'couvertCentsPerUnit');
  if (mode === 'off') return 0;
  if (mode === 'per_tab') return couvertCentsPerUnit;
  return couvertCentsPerUnit * (guestCount ?? 0);
}
