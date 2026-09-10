'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, TrendingUp } from 'lucide-react';
import { TenantProvider, useTenant } from '@/lib/tenant';
import { ApiError, apiFetch } from '@/lib/api';

interface ProductAgg {
  productId: string;
  name: string;
  quantity: number;
  revenueCents: number;
}
interface OperatorAgg {
  userId: string;
  name: string;
  count: number;
  amountCents: number;
}
interface DailyReport {
  fromISO: string;
  toISO: string;
  faturamentoCents: number;
  itemsSoldCount: number;
  tabsServedCount: number;
  ticketMedioCents: number;
  topProducts: ProductAgg[];
  cancellationsByOperator: OperatorAgg[];
  discountsByOperator: OperatorAgg[];
}

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Relatório do dia (M25, ACTIVE_PLAN.md) — consome `GET /v1/reports/daily` (M16), que
 * já existia só como API. Intervalo fixo "hoje" (00:00 local até agora) — sem seletor
 * de intervalo customizado nesta entrega (Gate de Plano do M25 #4, mesma decisão do
 * M16: sem biblioteca de timezone testada no projeto).
 */
export default function ReportsPage() {
  return (
    <TenantProvider>
      <ReportsContent />
    </TenantProvider>
  );
}

function ReportsContent() {
  const tenant = useTenant();
  const tenantId = tenant.status === 'ok' ? tenant.tenant.id : null;

  const [report, setReport] = useState<DailyReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    apiFetch<{ report: DailyReport }>(
      `/v1/reports/daily?from=${encodeURIComponent(startOfDay.toISOString())}&to=${encodeURIComponent(now.toISOString())}`,
      { headers: { 'x-tenant-id': tenantId } },
    )
      .then((data) => setReport(data.report))
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : 'Não foi possível carregar o relatório.');
      });
  }, [tenantId]);

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

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-4">
        <p className="text-[11px] font-medium tracking-widest text-muted-foreground uppercase">
          Caixa
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground">
          Relatório do dia
        </h1>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-8">
        {error ? (
          <p role="alert" className="flex items-center gap-2 text-sm text-danger">
            <AlertCircle className="h-4 w-4 shrink-0" strokeWidth={1.5} />
            {error}
          </p>
        ) : !report ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg bg-elevated" />
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Metric label="Faturamento" value={currency.format(report.faturamentoCents / 100)} />
              <Metric label="Ticket médio" value={currency.format(report.ticketMedioCents / 100)} />
              <Metric label="Comandas atendidas" value={String(report.tabsServedCount)} />
              <Metric label="Itens vendidos" value={String(report.itemsSoldCount)} />
            </div>

            <section className="mt-8">
              <h2 className="mb-3 flex items-center gap-1.5 text-[11px] font-medium tracking-widest text-muted-foreground uppercase">
                <TrendingUp className="h-3.5 w-3.5" strokeWidth={1.5} />
                Mais vendidos
              </h2>
              {report.topProducts.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma venda no período.</p>
              ) : (
                <ul className="divide-y divide-border rounded-lg border border-border-strong bg-surface shadow-[0_8px_24px_rgba(0,0,0,.03)]">
                  {report.topProducts.map((p) => (
                    <li key={p.productId} className="flex items-center justify-between px-4 py-3">
                      <span className="text-sm text-foreground">
                        {p.quantity}× {p.name}
                      </span>
                      <span className="font-mono-tabular text-sm text-muted-foreground">
                        {currency.format(p.revenueCents / 100)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {report.discountsByOperator.length > 0 ? (
              <section className="mt-8">
                <h2 className="mb-3 text-[11px] font-medium tracking-widest text-muted-foreground uppercase">
                  Descontos por operador
                </h2>
                <ul className="divide-y divide-border rounded-lg border border-border-strong bg-surface shadow-[0_8px_24px_rgba(0,0,0,.03)]">
                  {report.discountsByOperator.map((o) => (
                    <li key={o.userId} className="flex items-center justify-between px-4 py-3">
                      <span className="text-sm text-foreground">{o.name}</span>
                      <span className="font-mono-tabular text-sm text-muted-foreground">
                        {o.count}× · {currency.format(o.amountCents / 100)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {report.cancellationsByOperator.length > 0 ? (
              <section className="mt-8">
                <h2 className="mb-3 text-[11px] font-medium tracking-widest text-muted-foreground uppercase">
                  Cancelamentos por operador
                </h2>
                <ul className="divide-y divide-border rounded-lg border border-border-strong bg-surface shadow-[0_8px_24px_rgba(0,0,0,.03)]">
                  {report.cancellationsByOperator.map((o) => (
                    <li key={o.userId} className="flex items-center justify-between px-4 py-3">
                      <span className="text-sm text-foreground">{o.name}</span>
                      <span className="font-mono-tabular text-sm text-muted-foreground">
                        {o.count}× · {currency.format(o.amountCents / 100)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border-strong bg-surface p-4 shadow-[0_8px_24px_rgba(0,0,0,.03)]">
      <p className="text-[11px] font-medium tracking-widest text-muted-foreground uppercase">
        {label}
      </p>
      <p className="font-mono-tabular mt-1 text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}
