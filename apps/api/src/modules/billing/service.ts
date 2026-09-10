import { and, eq, inArray } from 'drizzle-orm';
import type { Db, Tx } from '@bella/db';
import { schema, withTenant } from '@bella/db';
import {
  applyBps,
  computeBillTotals,
  computeCouvertCents,
  computeServiceFeeCents,
  newId,
  splitEvenly,
  type BillTotals,
  type CouvertMode,
} from '@bella/domain';
import type {
  ApplyDiscountInput,
  CashMovementInput,
  CloseCashSessionInput,
  CreatePaymentInput,
  OpenCashSessionInput,
} from '@bella/contracts';
import { AppError } from '../../lib/errors';
import { withIdempotency } from '../../lib/idempotency';

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
 * Núcleo de `getBill`, extraído para ser reaproveitado por `recordPayment` (M13) DENTRO
 * da mesma transação — nunca abrir uma segunda transação para ler o saldo antes de
 * decidir `OVERPAYMENT` (o `FOR UPDATE` na `tab` só serializa corridas se for a MESMA
 * transação da escrita que depende dele, mesmo princípio do `createOrder` do M8).
 * Lança `service_fee`/`couvert` automaticamente NA PRIMEIRA vez que a conta é pedida —
 * idempotente por construção: `SELECT ... FOR UPDATE` na comanda serializa chamadas
 * concorrentes, e o lançamento só acontece se ainda não existe nenhuma entrada daquele
 * tipo no ledger desta comanda. Chamadas seguintes NUNCA recalculam ou duplicam — o
 * valor fica travado (ACTIVE_PLAN.md, Gate de Plano do M12, #4).
 */
async function computeBill(tx: Tx, tenantId: string, tabId: string): Promise<BillResult> {
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
}

export async function getBill(db: Db, tenantId: string, tabId: string): Promise<BillResult> {
  return withTenant(db, tenantId, (tx) => computeBill(tx, tenantId, tabId));
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

function isUniqueViolation(err: unknown): boolean {
  const message = err instanceof Error ? String(err.cause ?? err.message) : String(err);
  return /duplicate key|unique/i.test(message);
}

export interface CashSessionResult {
  id: string;
  status: string;
  openingFloatCents: number;
  openedAt: string;
}

/**
 * Abre a sessão de caixa do tenant (M13). Um tenant tem um único registrador (seed,
 * ACTIVE_PLAN.md #2 — sem CRUD ainda). Só uma sessão aberta por registrador — garantido
 * pelo índice único parcial `cash_sessions_open_per_register_key` (mesmo padrão de
 * `table_sessions_open_per_table_key`, M6), nunca por checagem em código.
 */
export async function openCashSession(
  db: Db,
  tenantId: string,
  actor: BillingActor,
  input: OpenCashSessionInput,
): Promise<CashSessionResult> {
  return withTenant(db, tenantId, async (tx) => {
    const [register] = await tx
      .select({ id: schema.cashRegisters.id })
      .from(schema.cashRegisters)
      .where(
        and(eq(schema.cashRegisters.tenantId, tenantId), eq(schema.cashRegisters.isActive, true)),
      );
    if (!register) throw new AppError('INTERNAL_ERROR', 'Nenhum registrador de caixa configurado.');

    try {
      const [row] = await tx
        .insert(schema.cashSessions)
        .values({
          id: newId(),
          tenantId,
          cashRegisterId: register.id,
          openedBy: actor.userId,
          openingFloatCents: input.openingFloatCents,
        })
        .returning();
      return {
        id: row!.id,
        status: row!.status,
        openingFloatCents: row!.openingFloatCents,
        openedAt: row!.openedAt.toISOString(),
      };
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      throw new AppError('CONFLICT', 'Já existe uma sessão de caixa aberta.');
    }
  });
}

/** Sessão de caixa aberta agora, se houver — leitura, qualquer staff do tenant. */
export async function getCurrentCashSession(
  db: Db,
  tenantId: string,
): Promise<CashSessionResult | null> {
  return withTenant(db, tenantId, async (tx) => {
    const [row] = await tx
      .select()
      .from(schema.cashSessions)
      .where(
        and(eq(schema.cashSessions.tenantId, tenantId), eq(schema.cashSessions.status, 'open')),
      );
    if (!row) return null;
    return {
      id: row.id,
      status: row.status,
      openingFloatCents: row.openingFloatCents,
      openedAt: row.openedAt.toISOString(),
    };
  });
}

export interface PaymentResult {
  id: string;
  status: string;
  amountCents: number;
  changeCents: number;
}

/**
 * Registra um pagamento manual contra a comanda (M13) — o Bella III recebe na
 * maquininha física, fora do sistema; isto é só a baixa (Victor, 2026-09-10,
 * `PRODUCT_CONTEXT.md §2` Q6). Reaproveita `computeBill` DENTRO desta transação para
 * ler o saldo com o mesmo `FOR UPDATE` que serializa pagamentos concorrentes na mesma
 * comanda — dois pagamentos que juntos excedem o saldo nunca passam os dois
 * (`OVERPAYMENT`), mesmo princípio do `createOrder` do M8.
 */
export async function recordPayment(
  db: Db,
  tenantId: string,
  tabId: string,
  actor: BillingActor,
  idempotencyKey: string,
  input: CreatePaymentInput,
): Promise<{ status: number; body: PaymentResult }> {
  return withTenant(db, tenantId, (tx) =>
    withIdempotency(tx, tenantId, 'payments.record', idempotencyKey, input, async () => {
      const [cashSession] = await tx
        .select({ id: schema.cashSessions.id })
        .from(schema.cashSessions)
        .where(
          and(eq(schema.cashSessions.tenantId, tenantId), eq(schema.cashSessions.status, 'open')),
        );
      if (!cashSession) {
        throw new AppError('CASH_SESSION_CLOSED', 'Nenhuma sessão de caixa aberta.');
      }

      const bill = await computeBill(tx, tenantId, tabId);
      if (bill.tabStatus !== 'open') {
        throw new AppError('TAB_CLOSED', 'Comanda já está fechada.');
      }
      if (input.amountCents > bill.balanceCents) {
        throw new AppError(
          'OVERPAYMENT',
          `Valor do pagamento (${input.amountCents}) excede o saldo da comanda (${bill.balanceCents}).`,
        );
      }

      const changeCents =
        input.method === 'cash'
          ? (input.tenderedCents ?? input.amountCents) - input.amountCents
          : 0;

      const [payment] = await tx
        .insert(schema.payments)
        .values({
          id: newId(),
          tenantId,
          tabId,
          cashSessionId: cashSession.id,
          method: input.method,
          amountCents: input.amountCents,
          tenderedCents: input.tenderedCents ?? null,
          changeCents: input.method === 'cash' ? changeCents : null,
          receivedByUserId: actor.userId,
          idempotencyKey,
        })
        .returning();

      await tx.insert(schema.ledgerEntries).values({
        id: newId(),
        tenantId,
        tabId,
        type: 'payment',
        amountCents: -input.amountCents,
        refType: 'payment',
        refId: payment!.id,
        createdBy: actor,
      });

      return {
        status: 201,
        body: {
          id: payment!.id,
          status: payment!.status,
          amountCents: payment!.amountCents,
          changeCents,
        },
      };
    }),
  );
}

export interface VoidPaymentResult {
  id: string;
  status: string;
}

/**
 * Estorna um pagamento registrado errado (M13). Idempotente por construção — mesmo
 * padrão do `cancelOrderItem` do M11: pagamento já `voided` é devolvido sem gerar um
 * segundo `payment_void` (dinheiro duplicado é o pior bug possível aqui).
 */
export async function voidPayment(
  db: Db,
  tenantId: string,
  paymentId: string,
  actor: BillingActor,
  reason: string,
): Promise<VoidPaymentResult> {
  return withTenant(db, tenantId, async (tx) => {
    const [payment] = await tx
      .select()
      .from(schema.payments)
      .where(and(eq(schema.payments.id, paymentId), eq(schema.payments.tenantId, tenantId)))
      .for('update');
    if (!payment) throw new AppError('NOT_FOUND', 'Pagamento não encontrado.');

    if (payment.status === 'voided') {
      return { id: payment.id, status: 'voided' };
    }

    await tx
      .update(schema.payments)
      .set({ status: 'voided', voidedAt: new Date(), voidReason: reason })
      .where(eq(schema.payments.id, paymentId));

    await tx.insert(schema.ledgerEntries).values({
      id: newId(),
      tenantId,
      tabId: payment.tabId,
      type: 'payment_void',
      amountCents: payment.amountCents,
      refType: 'payment',
      refId: payment.id,
      reason,
      createdBy: actor,
    });

    return { id: payment.id, status: 'voided' };
  });
}

export interface CashMovementResult {
  id: string;
  type: string;
  method: string;
  amountCents: number;
}

/**
 * Registra sangria/suprimento na sessão de caixa (M14). Sessão precisa estar `open` —
 * mesmo tipo de proteção que `recordPayment` já dá para comanda fechada
 * (`CASH_SESSION_CLOSED`, código reservado desde o M0).
 */
export async function recordCashMovement(
  db: Db,
  tenantId: string,
  cashSessionId: string,
  actor: BillingActor,
  input: CashMovementInput,
): Promise<CashMovementResult> {
  return withTenant(db, tenantId, async (tx) => {
    const [session] = await tx
      .select({ status: schema.cashSessions.status })
      .from(schema.cashSessions)
      .where(
        and(eq(schema.cashSessions.id, cashSessionId), eq(schema.cashSessions.tenantId, tenantId)),
      )
      .for('update');
    if (!session) throw new AppError('NOT_FOUND', 'Sessão de caixa não encontrada.');
    if (session.status !== 'open') {
      throw new AppError('CASH_SESSION_CLOSED', 'Sessão de caixa já está fechada.');
    }

    const [row] = await tx
      .insert(schema.cashMovements)
      .values({
        id: newId(),
        tenantId,
        cashSessionId,
        type: input.type,
        method: input.method,
        amountCents: input.amountCents,
        reason: input.reason,
        byUserId: actor.userId,
      })
      .returning();

    return { id: row!.id, type: row!.type, method: row!.method, amountCents: row!.amountCents };
  });
}

/**
 * `expected` por forma de pagamento (M14, ACTIVE_PLAN.md Gate de Plano #2): sempre
 * derivado de `payments`+`cashMovements`, nunca armazenado à parte. `cash` soma também
 * o fundo de troco de abertura.
 */
async function expectedByMethod(
  tx: Tx,
  tenantId: string,
  cashSessionId: string,
  openingFloatCents: number,
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const add = (method: string, delta: number) => map.set(method, (map.get(method) ?? 0) + delta);
  add('cash', openingFloatCents);

  const paymentRows = await tx
    .select({ method: schema.payments.method, amountCents: schema.payments.amountCents })
    .from(schema.payments)
    .where(
      and(
        eq(schema.payments.tenantId, tenantId),
        eq(schema.payments.cashSessionId, cashSessionId),
        eq(schema.payments.status, 'confirmed'),
      ),
    );
  for (const p of paymentRows) add(p.method, p.amountCents);

  const movementRows = await tx
    .select()
    .from(schema.cashMovements)
    .where(
      and(
        eq(schema.cashMovements.tenantId, tenantId),
        eq(schema.cashMovements.cashSessionId, cashSessionId),
      ),
    );
  for (const m of movementRows) {
    add(m.method, m.type === 'withdrawal' ? -m.amountCents : m.amountCents);
  }

  return map;
}

export interface CashSessionCloseSummary {
  id: string;
  status: string;
  byMethod: Array<{
    method: string;
    expectedCents: number;
    countedCents: number;
    differenceCents: number;
  }>;
}

/**
 * Fecha a sessão de caixa (M14). Idempotente por RECONSTRUÇÃO, não por bloqueio
 * (ACTIVE_PLAN.md Gate de Plano #3): `payments`/`cashMovements` não mudam mais depois
 * que a sessão fecha (ambos checam `status = 'open'` antes de gravar), então recalcular
 * `expected`/diferença numa sessão já fechada sempre dá a mesma resposta — uma segunda
 * chamada só NÃO insere `cashDivergences` de novo. Toda forma onde `counted ≠ expected`
 * é gravada em `cashDivergences` — inclusive forma esperada que o operador esqueceu de
 * contar (`counted` ausente = 0, vira divergência visível, nunca ajustada em silêncio).
 */
export async function closeCashSession(
  db: Db,
  tenantId: string,
  cashSessionId: string,
  actor: BillingActor,
  input: CloseCashSessionInput,
): Promise<CashSessionCloseSummary> {
  return withTenant(db, tenantId, async (tx) => {
    const [session] = await tx
      .select()
      .from(schema.cashSessions)
      .where(
        and(eq(schema.cashSessions.id, cashSessionId), eq(schema.cashSessions.tenantId, tenantId)),
      )
      .for('update');
    if (!session) throw new AppError('NOT_FOUND', 'Sessão de caixa não encontrada.');

    const expected = await expectedByMethod(tx, tenantId, cashSessionId, session.openingFloatCents);
    const countedMap = new Map<string, number>(input.counted.map((c) => [c.method, c.amountCents]));
    const methods = new Set([...expected.keys(), ...countedMap.keys()]);

    const byMethod = [...methods].map((method) => {
      const expectedCents = expected.get(method) ?? 0;
      const countedCents = countedMap.get(method) ?? 0;
      return { method, expectedCents, countedCents, differenceCents: countedCents - expectedCents };
    });

    if (session.status === 'open') {
      const divergenceRows = byMethod
        .filter((m) => m.differenceCents !== 0)
        .map((m) => ({
          id: newId(),
          tenantId,
          cashSessionId,
          method: m.method,
          expectedCents: m.expectedCents,
          countedCents: m.countedCents,
          differenceCents: m.differenceCents,
          acknowledgedBy: actor.userId,
        }));
      if (divergenceRows.length > 0) {
        await tx.insert(schema.cashDivergences).values(divergenceRows);
      }
      await tx
        .update(schema.cashSessions)
        .set({ status: 'closed', closedBy: actor.userId, closedAt: new Date() })
        .where(eq(schema.cashSessions.id, cashSessionId));
    }

    return { id: cashSessionId, status: 'closed', byMethod };
  });
}

export interface TabCloseResult {
  tabId: string;
  status: string;
  itemsTotalCents: number;
  discountsCents: number;
  serviceFeeCents: number;
  couvertCents: number;
  adjustmentsCents: number;
  grandTotalCents: number;
  paidTotalCents: number;
  closedAt: string;
}

/**
 * Fecha a comanda de fato (M15). Idempotente por construção — já `closed` devolve a
 * `tab_closures` já gravada (mesmo padrão do M11/M13), nunca uma segunda fotografia
 * (índice único em `tab_closures.tab_id`). Só fecha com `balance = 0` — fechar com
 * saldo pendente é o pior erro possível aqui (ACTIVE_PLAN.md, Gate de Plano #2).
 */
export async function closeTab(
  db: Db,
  tenantId: string,
  tabId: string,
  actor: BillingActor,
): Promise<TabCloseResult> {
  return withTenant(db, tenantId, async (tx) => {
    const [existing] = await tx
      .select()
      .from(schema.tabClosures)
      .where(and(eq(schema.tabClosures.tabId, tabId), eq(schema.tabClosures.tenantId, tenantId)));
    if (existing) {
      return {
        tabId,
        status: 'closed',
        itemsTotalCents: existing.itemsTotalCents,
        discountsCents: existing.discountsCents,
        serviceFeeCents: existing.serviceFeeCents,
        couvertCents: existing.couvertCents,
        adjustmentsCents: existing.adjustmentsCents,
        grandTotalCents: existing.grandTotalCents,
        paidTotalCents: existing.paidTotalCents,
        closedAt: existing.closedAt.toISOString(),
      };
    }

    const bill = await computeBill(tx, tenantId, tabId);
    if (bill.balanceCents !== 0) {
      throw new AppError(
        'CONFLICT',
        `Comanda tem saldo pendente de ${bill.balanceCents} centavos; não pode fechar.`,
      );
    }

    const closedAt = new Date();
    const [closure] = await tx
      .insert(schema.tabClosures)
      .values({
        id: newId(),
        tenantId,
        tabId,
        itemsTotalCents: bill.itemsTotalCents,
        discountsCents: bill.discountsCents,
        serviceFeeCents: bill.serviceFeeCents,
        couvertCents: bill.couvertCents,
        adjustmentsCents: bill.adjustmentsCents,
        grandTotalCents: bill.grandTotalCents,
        paidTotalCents: bill.paidTotalCents,
        closedBy: actor.userId,
        closedAt,
      })
      .returning();

    await tx
      .update(schema.tabs)
      .set({ status: 'closed', closedAt, closedBy: actor.userId })
      .where(eq(schema.tabs.id, tabId));

    return {
      tabId,
      status: 'closed',
      itemsTotalCents: closure!.itemsTotalCents,
      discountsCents: closure!.discountsCents,
      serviceFeeCents: closure!.serviceFeeCents,
      couvertCents: closure!.couvertCents,
      adjustmentsCents: closure!.adjustmentsCents,
      grandTotalCents: closure!.grandTotalCents,
      paidTotalCents: closure!.paidTotalCents,
      closedAt: closure!.closedAt.toISOString(),
    };
  });
}

export interface TabSplitResult {
  tabId: string;
  balanceCents: number;
  parts: number;
  shares: number[];
}

/**
 * Sugestão de divisão do saldo restante entre `parts` pessoas (M15) — puramente
 * informativa, nunca grava nada. Divide o `balance` (quanto falta pagar agora), não o
 * `grandTotal` original, para continuar útil mesmo com pagamento parcial já feito
 * (ACTIVE_PLAN.md, Gate de Plano #4). `splitEvenly` já existe desde o M0.
 */
export async function getTabSplit(
  db: Db,
  tenantId: string,
  tabId: string,
  parts: number,
): Promise<TabSplitResult> {
  return withTenant(db, tenantId, async (tx) => {
    const bill = await computeBill(tx, tenantId, tabId);
    return {
      tabId,
      balanceCents: bill.balanceCents,
      parts,
      shares: splitEvenly(bill.balanceCents, parts),
    };
  });
}
