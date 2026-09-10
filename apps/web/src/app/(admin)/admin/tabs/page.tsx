'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Banknote,
  CheckCircle2,
  Loader2,
  Percent,
  Receipt,
} from 'lucide-react';
import { TenantProvider, useTenant } from '@/lib/tenant';
import { ApiError, apiFetch } from '@/lib/api';

interface OpenTab {
  tabId: string;
  tabLabel: string;
  tableLabel: string;
}

interface Bill {
  tabId: string;
  tabStatus: string;
  itemsTotalCents: number;
  discountsCents: number;
  serviceFeeCents: number;
  couvertCents: number;
  adjustmentsCents: number;
  paidTotalCents: number;
  grandTotalCents: number;
  balanceCents: number;
}

type PaymentMethod = 'cash' | 'debit' | 'credit' | 'pix' | 'voucher' | 'other';

const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: 'Dinheiro',
  debit: 'Débito',
  credit: 'Crédito',
  pix: 'Pix',
  voucher: 'Vale',
  other: 'Outro',
};

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Comandas abertas + fechamento (M25, ACTIVE_PLAN.md). Consome API já pronta desde
 * M12/M13/M15 — sem lógica de negócio nova aqui, só a tela. Trabalha em duas etapas
 * (`screen`): lista de comandas abertas (`GET /v1/tabs/open`) → detalhe de uma comanda
 * (`GET /v1/tabs/:id/bill` + ações de desconto/pagamento/fechamento).
 */
export default function TabsPage() {
  return (
    <TenantProvider>
      <TabsContent />
    </TenantProvider>
  );
}

function TabsContent() {
  const tenant = useTenant();
  const tenantId = tenant.status === 'ok' ? tenant.tenant.id : null;

  const [tabs, setTabs] = useState<OpenTab[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<OpenTab | null>(null);

  const loadTabs = useCallback(async () => {
    if (!tenantId) return;
    try {
      const data = await apiFetch<{ tabs: OpenTab[] }>('/v1/tabs/open', {
        headers: { 'x-tenant-id': tenantId },
      });
      setTabs(data.tabs);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar as comandas.');
    }
  }, [tenantId]);

  useEffect(() => {
    void loadTabs();
  }, [loadTabs]);

  if (tenant.status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-pulse rounded-full bg-elevated" />
      </div>
    );
  }
  if (tenant.status === 'error') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <p role="alert" className="flex items-center gap-2 text-sm text-danger">
          <AlertCircle className="h-4 w-4" strokeWidth={1.5} />
          {tenant.message}
        </p>
      </main>
    );
  }
  if (!tenantId) return null;

  if (selected) {
    return (
      <TabDetail
        tenantId={tenantId}
        tab={selected}
        onBack={() => {
          setSelected(null);
          void loadTabs();
        }}
        onClosed={() => {
          setSelected(null);
          void loadTabs();
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-4">
        <p className="text-[11px] font-medium tracking-widest text-muted-foreground uppercase">
          Caixa
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground">
          Comandas abertas
        </h1>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-8">
        {error ? (
          <p role="alert" className="mb-4 flex items-center gap-2 text-sm text-danger">
            <AlertCircle className="h-4 w-4 shrink-0" strokeWidth={1.5} />
            {error}
          </p>
        ) : null}

        {!tabs ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg bg-elevated" />
            ))}
          </div>
        ) : tabs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma comanda aberta no momento.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {tabs.map((t) => (
              <li key={t.tabId}>
                <button
                  type="button"
                  onClick={() => setSelected(t)}
                  className="flex w-full items-center justify-between rounded-lg border border-border-strong bg-surface p-4 text-left shadow-[0_8px_24px_rgba(0,0,0,.03)] hover:bg-elevated"
                >
                  <span className="flex items-center gap-2 text-sm text-foreground">
                    <Receipt className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                    {t.tableLabel} — {t.tabLabel}
                  </span>
                  <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Ver conta
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

function TabDetail({
  tenantId,
  tab,
  onBack,
  onClosed,
}: {
  tenantId: string;
  tab: OpenTab;
  onBack: () => void;
  onClosed: () => void;
}) {
  const [bill, setBill] = useState<Bill | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [discountKind, setDiscountKind] = useState<'percentage' | 'fixed'>('percentage');
  const [discountValue, setDiscountValue] = useState('');
  const [discountReason, setDiscountReason] = useState('');
  const [applyingDiscount, setApplyingDiscount] = useState(false);

  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [amount, setAmount] = useState('');
  const [tendered, setTendered] = useState('');
  const [paying, setPaying] = useState(false);

  const [closing, setClosing] = useState(false);

  const headers = { 'x-tenant-id': tenantId };

  const loadBill = useCallback(async () => {
    try {
      const data = await apiFetch<{ bill: Bill }>(`/v1/tabs/${tab.tabId}/bill`, { headers });
      setBill(data.bill);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar a conta.');
    }
  }, [tab.tabId, tenantId]);

  useEffect(() => {
    void loadBill();
  }, [loadBill]);

  async function handleApplyDiscount(e: React.FormEvent) {
    e.preventDefault();
    setApplyingDiscount(true);
    setActionError(null);
    setMessage(null);
    try {
      const body =
        discountKind === 'percentage'
          ? {
              kind: 'percentage',
              bps: Math.round(Number(discountValue) * 100),
              reason: discountReason,
            }
          : {
              kind: 'fixed',
              amountCents: Math.round(Number(discountValue) * 100),
              reason: discountReason,
            };
      await apiFetch(`/v1/tabs/${tab.tabId}/discounts`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      setDiscountValue('');
      setDiscountReason('');
      setMessage('Desconto aplicado.');
      await loadBill();
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : 'Não foi possível aplicar o desconto.',
      );
    } finally {
      setApplyingDiscount(false);
    }
  }

  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    setPaying(true);
    setActionError(null);
    setMessage(null);
    try {
      const amountCents = Math.round(Number(amount) * 100);
      const body: Record<string, unknown> = { method, amountCents };
      if (method === 'cash') body.tenderedCents = Math.round(Number(tendered) * 100);
      // Chave nova a cada tentativa de submit -- nunca por render/mount, senão um clique
      // duplo com erro no meio reusaria a chave de uma tentativa falha (ACTIVE_PLAN.md).
      await apiFetch(`/v1/tabs/${tab.tabId}/payments`, {
        method: 'POST',
        headers: { ...headers, 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify(body),
      });
      setAmount('');
      setTendered('');
      setMessage('Pagamento registrado.');
      await loadBill();
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : 'Não foi possível registrar o pagamento.',
      );
    } finally {
      setPaying(false);
    }
  }

  async function handleClose() {
    setClosing(true);
    setActionError(null);
    try {
      await apiFetch(`/v1/tabs/${tab.tabId}/close`, { method: 'POST', headers });
      onClosed();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Não foi possível fechar a comanda.');
      setClosing(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-4">
        <button
          type="button"
          onClick={onBack}
          className="mb-2 flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
          Comandas abertas
        </button>
        <p className="text-[11px] font-medium tracking-widest text-muted-foreground uppercase">
          {tab.tableLabel}
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground">
          {tab.tabLabel}
        </h1>
      </header>

      <main className="mx-auto max-w-md px-6 py-8">
        {error ? (
          <p role="alert" className="mb-4 flex items-center gap-2 text-sm text-danger">
            <AlertCircle className="h-4 w-4 shrink-0" strokeWidth={1.5} />
            {error}
          </p>
        ) : null}

        {!bill ? (
          <div className="h-40 animate-pulse rounded-lg bg-elevated" />
        ) : (
          <>
            <div className="rounded-lg border border-border-strong bg-surface p-4 shadow-[0_8px_24px_rgba(0,0,0,.03)]">
              <dl className="flex flex-col gap-1.5 text-sm">
                <Row label="Itens" cents={bill.itemsTotalCents} />
                {bill.discountsCents !== 0 ? (
                  <Row label="Descontos" cents={bill.discountsCents} />
                ) : null}
                {bill.serviceFeeCents !== 0 ? (
                  <Row label="Taxa de serviço" cents={bill.serviceFeeCents} />
                ) : null}
                {bill.couvertCents !== 0 ? <Row label="Couvert" cents={bill.couvertCents} /> : null}
                <Row label="Total" cents={bill.grandTotalCents} emphasis />
                <Row label="Já pago" cents={bill.paidTotalCents} />
                <Row label="Saldo" cents={bill.balanceCents} emphasis />
              </dl>
            </div>

            {actionError ? (
              <p role="alert" className="mt-4 flex items-center gap-2 text-sm text-danger">
                <AlertCircle className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                {actionError}
              </p>
            ) : null}
            {message ? <p className="mt-4 text-sm text-success">{message}</p> : null}

            {bill.balanceCents > 0 ? (
              <>
                <section className="mt-8">
                  <h2 className="mb-3 flex items-center gap-1.5 text-[11px] font-medium tracking-widest text-muted-foreground uppercase">
                    <Percent className="h-3.5 w-3.5" strokeWidth={1.5} />
                    Desconto
                  </h2>
                  <form onSubmit={handleApplyDiscount} className="flex flex-col gap-3">
                    <div className="flex gap-2">
                      <select
                        value={discountKind}
                        onChange={(e) => setDiscountKind(e.target.value as 'percentage' | 'fixed')}
                        className="rounded-md border border-input bg-elevated px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                      >
                        <option value="percentage">%</option>
                        <option value="fixed">R$</option>
                      </select>
                      <input
                        required
                        type="number"
                        min="0"
                        step="0.01"
                        value={discountValue}
                        onChange={(e) => setDiscountValue(e.target.value)}
                        placeholder={discountKind === 'percentage' ? 'Ex.: 10' : 'Ex.: 15,00'}
                        className="font-mono-tabular flex-1 rounded-md border border-input bg-elevated px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                    <input
                      required
                      value={discountReason}
                      onChange={(e) => setDiscountReason(e.target.value)}
                      placeholder="Motivo (obrigatório)"
                      className="rounded-md border border-input bg-elevated px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                    />
                    <button
                      type="submit"
                      disabled={applyingDiscount}
                      className="flex items-center justify-center gap-2 rounded-md border border-border-strong px-4 py-2 text-sm font-medium text-foreground disabled:opacity-60"
                    >
                      {applyingDiscount ? (
                        <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
                      ) : (
                        'Aplicar desconto'
                      )}
                    </button>
                  </form>
                </section>

                <section className="mt-8">
                  <h2 className="mb-3 flex items-center gap-1.5 text-[11px] font-medium tracking-widest text-muted-foreground uppercase">
                    <Banknote className="h-3.5 w-3.5" strokeWidth={1.5} />
                    Registrar pagamento
                  </h2>
                  <form onSubmit={handlePay} className="flex flex-col gap-3">
                    <select
                      value={method}
                      onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                      className="rounded-md border border-input bg-elevated px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                    >
                      {(Object.keys(METHOD_LABEL) as PaymentMethod[]).map((m) => (
                        <option key={m} value={m}>
                          {METHOD_LABEL[m]}
                        </option>
                      ))}
                    </select>
                    <input
                      required
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="Valor (R$)"
                      className="font-mono-tabular rounded-md border border-input bg-elevated px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                    />
                    {method === 'cash' ? (
                      <input
                        required
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={tendered}
                        onChange={(e) => setTendered(e.target.value)}
                        placeholder="Valor entregue pelo cliente (R$)"
                        className="font-mono-tabular rounded-md border border-input bg-elevated px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                      />
                    ) : null}
                    {method === 'cash' && amount && tendered ? (
                      <p className="font-mono-tabular text-sm text-muted-foreground">
                        Troco: {currency.format(Math.max(0, Number(tendered) - Number(amount)))}
                      </p>
                    ) : null}
                    <button
                      type="submit"
                      disabled={paying}
                      className="flex items-center justify-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-medium text-brand-foreground disabled:opacity-60"
                    >
                      {paying ? (
                        <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
                      ) : (
                        'Registrar pagamento'
                      )}
                    </button>
                  </form>
                </section>
              </>
            ) : (
              <button
                type="button"
                onClick={handleClose}
                disabled={closing}
                className="mt-8 flex w-full items-center justify-center gap-2 rounded-md bg-success px-4 py-3 text-sm font-medium text-brand-foreground disabled:opacity-60"
              >
                {closing ? (
                  <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" strokeWidth={1.5} />
                    Fechar comanda
                  </>
                )}
              </button>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function Row({ label, cents, emphasis }: { label: string; cents: number; emphasis?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className={emphasis ? 'font-medium text-foreground' : 'text-muted-foreground'}>
        {label}
      </dt>
      <dd
        className={`font-mono-tabular ${emphasis ? 'font-semibold text-foreground' : 'text-foreground'}`}
      >
        {currency.format(cents / 100)}
      </dd>
    </div>
  );
}
