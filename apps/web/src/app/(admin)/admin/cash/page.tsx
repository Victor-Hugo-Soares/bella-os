'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, ArrowDownCircle, ArrowUpCircle, Lock, Unlock } from 'lucide-react';
import { TenantProvider, useTenant } from '@/lib/tenant';
import { ApiError, apiFetch } from '@/lib/api';

interface CashSession {
  id: string;
  status: string;
  openingFloatCents: number;
  openedAt: string;
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

interface CloseSummaryRow {
  method: string;
  expectedCents: number;
  countedCents: number;
  differenceCents: number;
}
interface CloseSummary {
  id: string;
  status: string;
  byMethod: CloseSummaryRow[];
}

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Abrir/fechar sessão de caixa + sangria/suprimento (M25, ACTIVE_PLAN.md). API pronta
 * desde M13/M14 — só a tela. Um registrador por tenant (sem CRUD ainda, seed), então
 * "a sessão atual" é o único estado que importa aqui.
 */
export default function CashPage() {
  return (
    <TenantProvider>
      <CashContent />
    </TenantProvider>
  );
}

function CashContent() {
  const tenant = useTenant();
  const tenantId = tenant.status === 'ok' ? tenant.tenant.id : null;

  const [session, setSession] = useState<CashSession | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [closeSummary, setCloseSummary] = useState<CloseSummary | null>(null);

  const [openingFloat, setOpeningFloat] = useState('');
  const [opening, setOpening] = useState(false);

  const [movType, setMovType] = useState<'withdrawal' | 'deposit'>('withdrawal');
  const [movMethod, setMovMethod] = useState<PaymentMethod>('cash');
  const [movAmount, setMovAmount] = useState('');
  const [movReason, setMovReason] = useState('');
  const [movSending, setMovSending] = useState(false);

  const [counted, setCounted] = useState<Record<PaymentMethod, string>>({
    cash: '',
    debit: '',
    credit: '',
    pix: '',
    voucher: '',
    other: '',
  });
  const [closing, setClosing] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId) return;
    try {
      const data = await apiFetch<{ session: CashSession | null }>('/v1/cash-sessions/current', {
        headers: { 'x-tenant-id': tenantId },
      });
      setSession(data.session);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar o caixa.');
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

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

  const headers = { 'x-tenant-id': tenantId };

  async function handleOpen(e: React.FormEvent) {
    e.preventDefault();
    setOpening(true);
    setActionError(null);
    try {
      await apiFetch('/v1/cash-sessions/open', {
        method: 'POST',
        headers,
        body: JSON.stringify({ openingFloatCents: Math.round(Number(openingFloat) * 100) }),
      });
      setOpeningFloat('');
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Não foi possível abrir o caixa.');
    } finally {
      setOpening(false);
    }
  }

  async function handleMovement(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    setMovSending(true);
    setActionError(null);
    setMessage(null);
    try {
      await apiFetch(`/v1/cash-sessions/${session.id}/movements`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          type: movType,
          method: movMethod,
          amountCents: Math.round(Number(movAmount) * 100),
          reason: movReason,
        }),
      });
      setMovAmount('');
      setMovReason('');
      setMessage(movType === 'withdrawal' ? 'Sangria registrada.' : 'Suprimento registrado.');
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Não foi possível registrar.');
    } finally {
      setMovSending(false);
    }
  }

  async function handleClose(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    const filled = (Object.keys(counted) as PaymentMethod[]).filter((m) => counted[m] !== '');
    if (filled.length === 0) {
      setActionError('Preencha a contagem de pelo menos uma forma de pagamento.');
      return;
    }
    setClosing(true);
    setActionError(null);
    try {
      const data = await apiFetch<{ summary: CloseSummary }>(
        `/v1/cash-sessions/${session.id}/close`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            counted: (Object.keys(counted) as PaymentMethod[])
              .filter((m) => counted[m] !== '')
              .map((m) => ({ method: m, amountCents: Math.round(Number(counted[m]) * 100) })),
          }),
        },
      );
      setCloseSummary(data.summary);
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Não foi possível fechar o caixa.');
    } finally {
      setClosing(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-4">
        <p className="text-[11px] font-medium tracking-widest text-muted-foreground uppercase">
          Caixa
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground">
          Sessão de caixa
        </h1>
      </header>

      <main className="mx-auto max-w-md px-6 py-8">
        {error ? (
          <p role="alert" className="mb-4 flex items-center gap-2 text-sm text-danger">
            <AlertCircle className="h-4 w-4 shrink-0" strokeWidth={1.5} />
            {error}
          </p>
        ) : null}
        {actionError ? (
          <p role="alert" className="mb-4 flex items-center gap-2 text-sm text-danger">
            <AlertCircle className="h-4 w-4 shrink-0" strokeWidth={1.5} />
            {actionError}
          </p>
        ) : null}
        {message ? <p className="mb-4 text-sm text-success">{message}</p> : null}

        {session === undefined ? (
          <div className="h-32 animate-pulse rounded-lg bg-elevated" />
        ) : closeSummary ? (
          <div className="rounded-lg border border-border-strong bg-surface p-4 shadow-[0_8px_24px_rgba(0,0,0,.03)]">
            <p className="mb-3 text-sm font-medium text-foreground">Caixa fechado — conferência</p>
            <dl className="flex flex-col gap-2 text-sm">
              {closeSummary.byMethod.map((row) => (
                <div key={row.method} className="flex items-center justify-between">
                  <dt className="text-muted-foreground">
                    {METHOD_LABEL[row.method as PaymentMethod] ?? row.method}
                  </dt>
                  <dd className="font-mono-tabular text-right">
                    <span className="text-foreground">
                      {currency.format(row.countedCents / 100)}
                    </span>
                    {row.differenceCents !== 0 ? (
                      <span className="ml-2 text-danger">
                        ({row.differenceCents > 0 ? '+' : ''}
                        {currency.format(row.differenceCents / 100)})
                      </span>
                    ) : null}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ) : session === null ? (
          <form onSubmit={handleOpen} className="flex flex-col gap-3">
            <label className="text-[11px] font-medium tracking-widest text-muted-foreground uppercase">
              Valor de abertura (R$)
            </label>
            <input
              required
              type="number"
              min="0"
              step="0.01"
              value={openingFloat}
              onChange={(e) => setOpeningFloat(e.target.value)}
              className="font-mono-tabular rounded-md border border-input bg-elevated px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              type="submit"
              disabled={opening}
              className="flex items-center justify-center gap-2 rounded-md bg-brand px-4 py-2.5 text-sm font-medium text-brand-foreground disabled:opacity-60"
            >
              <Unlock className="h-4 w-4" strokeWidth={1.5} />
              Abrir caixa
            </button>
          </form>
        ) : (
          <>
            <div className="rounded-lg border border-border-strong bg-surface p-4 shadow-[0_8px_24px_rgba(0,0,0,.03)]">
              <p className="text-[11px] font-medium tracking-widest text-muted-foreground uppercase">
                Aberto desde
              </p>
              <p className="mt-1 text-sm text-foreground">
                {new Date(session.openedAt).toLocaleString('pt-BR')}
              </p>
              <p className="mt-3 text-[11px] font-medium tracking-widest text-muted-foreground uppercase">
                Valor de abertura
              </p>
              <p className="font-mono-tabular mt-1 text-sm text-foreground">
                {currency.format(session.openingFloatCents / 100)}
              </p>
            </div>

            <section className="mt-8">
              <h2 className="mb-3 text-[11px] font-medium tracking-widest text-muted-foreground uppercase">
                Sangria / suprimento
              </h2>
              <form onSubmit={handleMovement} className="flex flex-col gap-3">
                <div className="flex gap-2">
                  <select
                    value={movType}
                    onChange={(e) => setMovType(e.target.value as 'withdrawal' | 'deposit')}
                    className="flex-1 rounded-md border border-input bg-elevated px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="withdrawal">Sangria (saída)</option>
                    <option value="deposit">Suprimento (entrada)</option>
                  </select>
                  <select
                    value={movMethod}
                    onChange={(e) => setMovMethod(e.target.value as PaymentMethod)}
                    className="rounded-md border border-input bg-elevated px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                  >
                    {(Object.keys(METHOD_LABEL) as PaymentMethod[]).map((m) => (
                      <option key={m} value={m}>
                        {METHOD_LABEL[m]}
                      </option>
                    ))}
                  </select>
                </div>
                <input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={movAmount}
                  onChange={(e) => setMovAmount(e.target.value)}
                  placeholder="Valor (R$)"
                  className="font-mono-tabular rounded-md border border-input bg-elevated px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                />
                <input
                  required
                  value={movReason}
                  onChange={(e) => setMovReason(e.target.value)}
                  placeholder="Motivo"
                  className="rounded-md border border-input bg-elevated px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                />
                <button
                  type="submit"
                  disabled={movSending}
                  className="flex items-center justify-center gap-2 rounded-md border border-border-strong px-4 py-2 text-sm font-medium text-foreground disabled:opacity-60"
                >
                  {movType === 'withdrawal' ? (
                    <ArrowDownCircle className="h-4 w-4" strokeWidth={1.5} />
                  ) : (
                    <ArrowUpCircle className="h-4 w-4" strokeWidth={1.5} />
                  )}
                  Registrar
                </button>
              </form>
            </section>

            <section className="mt-8">
              <h2 className="mb-3 text-[11px] font-medium tracking-widest text-muted-foreground uppercase">
                Fechar caixa — contagem por forma
              </h2>
              <form onSubmit={handleClose} className="flex flex-col gap-3">
                {(Object.keys(METHOD_LABEL) as PaymentMethod[]).map((m) => (
                  <div key={m} className="flex items-center gap-3">
                    <label className="w-20 shrink-0 text-sm text-muted-foreground">
                      {METHOD_LABEL[m]}
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={counted[m]}
                      onChange={(e) => setCounted((c) => ({ ...c, [m]: e.target.value }))}
                      placeholder="0,00"
                      className="font-mono-tabular flex-1 rounded-md border border-input bg-elevated px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                ))}
                <button
                  type="submit"
                  disabled={closing}
                  className="flex items-center justify-center gap-2 rounded-md bg-danger px-4 py-2.5 text-sm font-medium text-brand-foreground disabled:opacity-60"
                >
                  <Lock className="h-4 w-4" strokeWidth={1.5} />
                  Fechar caixa
                </button>
              </form>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
