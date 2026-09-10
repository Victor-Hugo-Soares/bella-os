import { and, eq, inArray } from 'drizzle-orm';
import type { Db, Tx } from '@bella/db';
import { schema, withTenant } from '@bella/db';
import {
  applyBps,
  computeBillTotals,
  computeCouvertCents,
  computeServiceFeeCents,
  newId,
  type BillTotals,
  type CouvertMode,
} from '@bella/domain';
import type { ApplyDiscountInput } from '@bella/contracts';
import { AppError } from '../../lib/errors';

export interface BillingActor {
  type: 'user';
  userId: string;
}

const LEDGER_TYPE_GROUPS = {
  items: ['item_charge', 'item_reversal'],
  discounts: ['discount'],
  serviceFee: ['service_fee'],
  couvert: ['couvert'],
  adjustments: ['adjustment'],
  paid: ['payment', 'payment_void'],
} as const;

async function sumLedgerByTypes(
  tx: Tx,
  tenantId: string,
  tabId: string,
  types: readonly string[],
): Promise<number> {
  const rows = await tx
    .select({ amountCents: schema.ledgerEntries.amountCents })
    .from(schema.ledgerEntries)
    .where(
      and(
        eq(schema.ledgerEntries.tenantId, tenantId),
        eq(schema.ledgerEntries.tabId, tabId),
        inArray(schema.ledgerEntries.type, types),
      ),
    );
  return rows.reduce((sum, r) => sum + r.amountCents, 0);
}

export interface BillResult extends BillTotals {
  tabId: string;
  tabStatus: string;
}

/**
 * Reconstrói o total da comanda a partir do ledger (M12, DOMAIN_MODEL.md §4). Lança
 * `service_fee`/`couvert` automaticamente NA PRIMEIRA vez que a conta é pedida —
 * idempotente por construção: `SELECT ... FOR UPDATE` na comanda serializa chamadas
 * concorrentes (mesmo padrão do M8), e o lançamento só acontece se ainda não existe
 * nenhuma entrada daquele tipo no ledger desta comanda. Chamadas seguintes NUNCA
 * recalculam ou duplicam — o valor fica travado (ACTIVE_PLAN.md, Gate de Plano #4).
 */
export async function getBill(db: Db, tenantId: string, tabId: string): Promise<BillResult> {
  return withTenant(db, tenantId, async (tx) => {
    const [tab] = await tx
      .select()
      .from(schema.tabs)
      .where(and(eq(schema.tabs.id, tabId), eq(schema.tabs.tenantId, tenantId)))
      .for('update');
    if (!tab) throw new AppError('NOT_FOUND', 'Comanda não encontrada.');

    const [settings] = await tx
      .select()
      .from(schema.tenantSettings)
      .where(eq(schema.tenantSettings.tenantId, tenantId));
    if (!settings) throw new AppError('INTERNAL_ERROR', 'Configuração do tenant não encontrada.');

    const [session] = await tx
      .select({ guestCount: schema.tableSessions.guestCount })
      .from(schema.tableSessions)
      .where(eq(schema.tableSessions.id, tab.tableSessionId));

    const itemsTotalCents = await sumLedgerByTypes(tx, tenantId, tabId, LEDGER_TYPE_GROUPS.items);
    const discountsLedgerCents = await sumLedgerByTypes(
      tx,
      tenantId,
      tabId,
      LEDGER_TYPE_GROUPS.discounts,
    );
    const netItemsAfterDiscountCents = itemsTotalCents + discountsLedgerCents;

    const existingFeeTypes = await tx
      .select({ type: schema.ledgerEntries.type })
      .from(schema.ledgerEntries)
      .where(
        and(
          eq(schema.ledgerEntries.tenantId, tenantId),
          eq(schema.ledgerEntries.tabId, tabId),
          inArray(schema.ledgerEntries.type, [
            ...LEDGER_TYPE_GROUPS.serviceFee,
            ...LEDGER_TYPE_GROUPS.couvert,
          ]),
        ),
      );
    const hasServiceFeeEntry = existingFeeTypes.some((r) => r.type === 'service_fee');
    const hasCouvertEntry = existingFeeTypes.some((r) => r.type === 'couvert');

    const toInsert: Array<{ type: 'service_fee' | 'couvert'; amountCents: number }> = [];
    if (!hasServiceFeeEntry && settings.serviceFeeMode !== 'off') {
      const amount = computeServiceFeeCents(netItemsAfterDiscountCents, settings.serviceFeeBps);
      if (amount > 0) toInsert.push({ type: 'service_fee', amountCents: amount });
    }
    if (!hasCouvertEntry && settings.couvertMode !== 'off') {
      const amount = computeCouvertCents(
        settings.couvertCents,
        settings.couvertMode as CouvertMode,
        session?.guestCount ?? null,
      );
      if (amount > 0) toInsert.push({ type: 'couvert', amountCents: amount });
    }
    if (toInsert.length > 0) {
      await tx.insert(schema.ledgerEntries).values(
        toInsert.map((entry) => ({
          id: newId(),
          tenantId,
          tabId,
          type: entry.type,
          amountCents: entry.amountCents,
          refType: 'tab',
          refId: tabId,
          createdBy: { type: 'system', reason: 'auto_bill_lock' },
        })),
      );
    }

    const serviceFeeCents = await sumLedgerByTypes(
      tx,
      tenantId,
      tabId,
      LEDGER_TYPE_GROUPS.serviceFee,
    );
    const couvertCents = await sumLedgerByTypes(tx, tenantId, tabId, LEDGER_TYPE_GROUPS.couvert);
    const adjustmentsCents = await sumLedgerByTypes(
      tx,
      tenantId,
      tabId,
      LEDGER_TYPE_GROUPS.adjustments,
    );
    const paidLedgerCents = await sumLedgerByTypes(tx, tenantId, tabId, LEDGER_TYPE_GROUPS.paid);

    const totals = computeBillTotals({
      itemsTotalCents,
      discountsCents: -discountsLedgerCents,
      serviceFeeCents,
      couvertCents,
      adjustmentsCents,
      paidTotalCents: -paidLedgerCents,
    });

    return { tabId, tabStatus: tab.status, ...totals };
  });
}

export interface DiscountResult {
  id: string;
  amountCents: number;
  reason: string;
}

/**
 * Aplica um desconto manual na comanda (M12). Percentual é calculado em cima do total
 * de itens já líquido de descontos anteriores (nunca do total original — evita
 * desconto empilhado sobre desconto). Desconto maior que o saldo de itens é REJEITADO,
 * nunca limitado a zero em silêncio (ACTIVE_PLAN.md, Gate de Plano #5).
 */
export async function applyDiscount(
  db: Db,
  tenantId: string,
  tabId: string,
  actor: BillingActor,
  input: ApplyDiscountInput,
): Promise<DiscountResult> {
  return withTenant(db, tenantId, async (tx) => {
    const [tab] = await tx
      .select()
      .from(schema.tabs)
      .where(and(eq(schema.tabs.id, tabId), eq(schema.tabs.tenantId, tenantId)))
      .for('update');
    if (!tab) throw new AppError('NOT_FOUND', 'Comanda não encontrada.');
    if (tab.status !== 'open') throw new AppError('TAB_CLOSED', 'Comanda já está fechada.');

    const itemsTotalCents = await sumLedgerByTypes(tx, tenantId, tabId, LEDGER_TYPE_GROUPS.items);
    const discountsLedgerCents = await sumLedgerByTypes(
      tx,
      tenantId,
      tabId,
      LEDGER_TYPE_GROUPS.discounts,
    );
    const netItemsAfterDiscountCents = itemsTotalCents + discountsLedgerCents;

    const amountCents =
      input.kind === 'fixed' ? input.amountCents : applyBps(netItemsAfterDiscountCents, input.bps);

    if (amountCents <= 0) {
      throw new AppError('VALIDATION_ERROR', 'Valor do desconto deve ser positivo.');
    }
    if (amountCents > netItemsAfterDiscountCents) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Desconto maior que o saldo de itens da comanda; ajuste o valor.',
      );
    }

    const [entry] = await tx
      .insert(schema.ledgerEntries)
      .values({
        id: newId(),
        tenantId,
        tabId,
        type: 'discount',
        amountCents: -amountCents,
        refType: 'tab',
        refId: tabId,
        reason: input.reason,
        createdBy: actor,
      })
      .returning({ id: schema.ledgerEntries.id });

    return { id: entry!.id, amountCents, reason: input.reason };
  });
}
