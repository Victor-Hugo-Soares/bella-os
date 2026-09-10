'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Bell, CheckCircle2, Receipt } from 'lucide-react';
import { TenantProvider, useTenant } from '@/lib/tenant';
import { ApiError, apiFetch } from '@/lib/api';

interface ServiceRequest {
  id: string;
  kind: string;
  note: string | null;
  status: string;
  createdAt: string;
}
interface ReadyTicketItem {
  id: string;
  name: string;
  quantity: number;
}
interface ReadyTicket {
  id: string;
  items: ReadyTicketItem[];
}

const KIND_LABEL: Record<string, string> = {
  call_waiter: 'Chamar garçom',
  request_bill: 'Pedir a conta',
  other: 'Outro',
};

const POLL_MS = 4000;

/**
 * Chamados + expedição (M10) — uma tela só para as duas listas, decisão registrada
 * em ACTIVE_PLAN.md para não multiplicar telas de staff neste milestone.
 */
export default function ServiceRequestsPage() {
  return (
    <TenantProvider>
      <ServiceRequestsContent />
    </TenantProvider>
  );
}

function ServiceRequestsContent() {
  const tenant = useTenant();
  const tenantId = tenant.status === 'ok' ? tenant.tenant.id : null;

  const [requests, setRequests] = useState<ServiceRequest[] | null>(null);
  const [tickets, setTickets] = useState<ReadyTicket[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    const headers = { 'x-tenant-id': tenantId };
    try {
      const [requestsRes, ticketsRes] = await Promise.all([
        apiFetch<{ serviceRequests: ServiceRequest[] }>('/v1/service-requests', { headers }),
        apiFetch<{ tickets: ReadyTicket[] }>('/v1/tickets/ready', { headers }),
      ]);
      setRequests(requestsRes.serviceRequests);
      setTickets(ticketsRes.tickets);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar.');
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
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

  async function handleTransition(id: string, action: 'acknowledge' | 'done') {
    if (!tenantId) return;
    await apiFetch(`/v1/service-requests/${id}/${action}`, {
      method: 'PATCH',
      headers: { 'x-tenant-id': tenantId },
    });
    await load();
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-4">
        <p className="text-[11px] font-medium tracking-widest text-muted-foreground uppercase">
          Salão
        </p>
        <h1 className="mt-1 font-display text-xl font-semibold tracking-tight text-foreground">
          Chamados e expedição
        </h1>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-8">
        {error ? (
          <p role="alert" className="mb-4 flex items-center gap-2 text-sm text-danger">
            <AlertCircle className="h-4 w-4 shrink-0" strokeWidth={1.5} />
            {error}
          </p>
        ) : null}

        <section className="mb-8">
          <h2 className="mb-3 text-[11px] font-medium tracking-widest text-muted-foreground uppercase">
            Chamados abertos
          </h2>
          {!requests ? (
            <div className="h-16 animate-pulse rounded-md bg-elevated" />
          ) : requests.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum chamado no momento.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {requests.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between rounded-md border border-border bg-surface p-3"
                >
                  <span className="flex items-center gap-2 text-sm text-foreground">
                    {r.kind === 'request_bill' ? (
                      <Receipt className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                    ) : (
                      <Bell className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                    )}
                    {KIND_LABEL[r.kind] ?? r.kind}
                  </span>
                  <div className="flex gap-2">
                    {r.status === 'open' ? (
                      <button
                        type="button"
                        onClick={() => handleTransition(r.id, 'acknowledge')}
                        className="text-xs font-medium tracking-wide text-muted-foreground uppercase hover:text-foreground"
                      >
                        Visto
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => handleTransition(r.id, 'done')}
                      className="text-xs font-medium tracking-wide text-success uppercase hover:opacity-80"
                    >
                      Atendido
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-[11px] font-medium tracking-widest text-muted-foreground uppercase">
            Prontos para entrega
          </h2>
          {!tickets ? (
            <div className="h-16 animate-pulse rounded-md bg-elevated" />
          ) : tickets.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nada pronto no momento.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {tickets.map((t) => (
                <li key={t.id} className="rounded-md border border-border bg-surface p-3">
                  <div className="mb-1 flex items-center gap-1.5 text-sm font-medium text-success">
                    <CheckCircle2 className="h-4 w-4" strokeWidth={1.5} />
                    Pronto
                  </div>
                  {t.items.map((item) => (
                    <p key={item.id} className="text-sm text-foreground">
                      {item.quantity}× {item.name}
                    </p>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
