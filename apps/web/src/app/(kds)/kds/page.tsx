'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Bell, ChefHat, Play, WifiOff } from 'lucide-react';
import { ApiError, apiFetch } from '@/lib/api';

const DEVICE_TOKEN_STORAGE_KEY = 'bella_kds_device_token';
const POLL_FALLBACK_MS = 5000;
// Mesmo número documentado em ARCHITECTURE.md: heartbeat a cada 15s, margem de 2x
// antes de considerar a conexão "sem resposta" (M20, ACTIVE_PLAN.md).
const CONNECTION_WATCHDOG_MS = 30_000;

interface TicketItem {
  id: string;
  name: string;
  quantity: number;
  notes: string | null;
  status: string;
}
interface Ticket {
  id: string;
  status: string;
  recallCount: number;
  items: TicketItem[];
}

/**
 * Tela de KDS (M9, DOMAIN_MODEL.md §2.6). Legível a 1,5 m: fonte grande, botões
 * enormes, sem scroll horizontal (`FRONTEND_GUIDELINES.md §5`). Tempo real via SSE
 * (`/v1/stream`) + **polling de segurança** (recarrega a cada `POLL_FALLBACK_MS`
 * mesmo sem evento — cobre o caso de o SSE cair silenciosamente).
 */
export default function KdsPage() {
  const [deviceToken, setDeviceToken] = useState<string | null>(null);

  useEffect(() => {
    setDeviceToken(localStorage.getItem(DEVICE_TOKEN_STORAGE_KEY));
  }, []);

  if (deviceToken === null) {
    return <PairingScreen onPaired={setDeviceToken} />;
  }
  return <TicketBoard deviceToken={deviceToken} />;
}

function PairingScreen({ onPaired }: { onPaired: (token: string) => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pairing, setPairing] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPairing(true);
    setError(null);
    try {
      const result = await apiFetch<{ token: string }>('/v1/devices/exchange', {
        method: 'POST',
        body: JSON.stringify({ code }),
      });
      localStorage.setItem(DEVICE_TOKEN_STORAGE_KEY, result.token);
      onPaired(result.token);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Código inválido.');
    } finally {
      setPairing(false);
    }
  }

  return (
    <main className="kds-theme flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-6">
      <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-card-warm">
        <ChefHat className="h-7 w-7 text-card-warm-foreground" strokeWidth={1.5} />
      </div>
      <form onSubmit={handleSubmit} className="flex w-full max-w-xs flex-col gap-4">
        <label className="text-center text-sm text-muted-foreground">
          Digite o código de pareamento gerado pelo gerente
        </label>
        <input
          required
          inputMode="numeric"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="rounded-lg border border-input bg-elevated px-4 py-3 text-center text-2xl tracking-widest text-foreground outline-none focus:ring-2 focus:ring-ring"
        />
        {error ? (
          <p role="alert" className="text-center text-sm text-danger">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pairing}
          className="rounded-lg bg-brand px-4 py-3 text-sm font-medium text-brand-foreground disabled:opacity-60"
        >
          Parear
        </button>
      </form>
    </main>
  );
}

function TicketBoard({ deviceToken }: { deviceToken: string }) {
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 'sem conexão' só reflete o estado do SSE — o polling de segurança (POLL_FALLBACK_MS)
  // continua funcionando independentemente disso, então a tela nunca trava mesmo com o
  // banner visível (M20, ACTIVE_PLAN.md).
  const [connectionOk, setConnectionOk] = useState(true);
  const eventSourceRef = useRef<EventSource | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ tickets: Ticket[] }>('/v1/kds/tickets', {
        headers: { 'x-device-token': deviceToken },
      });
      setTickets(data.tickets);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar os tickets.');
    }
  }, [deviceToken]);

  useEffect(() => {
    void load();
    const pollTimer = setInterval(() => void load(), POLL_FALLBACK_MS);

    const url = new URL('/v1/stream', process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001');
    url.searchParams.set('deviceToken', deviceToken);
    // EventSource não permite headers customizados — o token vai por query string
    // aqui (mesma sensibilidade de um token em URL de troca de código, M3: curto
    // prazo de uso dentro da mesma rede local do restaurante).
    const source = new EventSource(url.toString());
    eventSourceRef.current = source;

    // Watchdog: qualquer evento nomeado (heartbeat ou de negócio) prova que a conexão
    // está viva e reseta o timer. Sem NENHUM evento por CONNECTION_WATCHDOG_MS, a
    // conexão é tratada como "sem resposta" mesmo que o EventSource não tenha
    // disparado onerror (desconexão silenciosa, ex.: cabo de rede puxado).
    let watchdogTimer: ReturnType<typeof setTimeout>;
    function resetWatchdog() {
      setConnectionOk(true);
      clearTimeout(watchdogTimer);
      watchdogTimer = setTimeout(() => setConnectionOk(false), CONNECTION_WATCHDOG_MS);
    }
    resetWatchdog();

    source.addEventListener('heartbeat', resetWatchdog);
    source.addEventListener('order.created', () => {
      resetWatchdog();
      void load();
    });
    // item.cancelled (M11): recarrega para mostrar o destaque "CANCELADO" em tempo real.
    source.addEventListener('item.cancelled', () => {
      resetWatchdog();
      void load();
    });
    source.onopen = resetWatchdog;
    // onerror dispara em qualquer queda de conexão (o browser tenta reconectar
    // sozinho) — reage na hora, não espera o watchdog de 30s.
    source.onerror = () => setConnectionOk(false);

    return () => {
      clearInterval(pollTimer);
      clearTimeout(watchdogTimer);
      source.close();
    };
  }, [deviceToken, load]);

  async function bump(ticketId: string, action: 'start' | 'ready' | 'recall') {
    await apiFetch(`/v1/kds/tickets/${ticketId}/${action}`, {
      method: 'POST',
      headers: { 'x-device-token': deviceToken },
    });
    await load();
  }

  if (error) {
    return (
      <main className="kds-theme flex min-h-screen items-center justify-center bg-background px-6">
        <ConnectionBanner show={!connectionOk} />
        <p role="alert" className="flex items-center gap-2 text-lg text-danger">
          <AlertCircle className="h-6 w-6" strokeWidth={1.5} />
          {error}
        </p>
      </main>
    );
  }

  if (!tickets) {
    return (
      <main className="kds-theme flex min-h-screen items-center justify-center bg-background">
        <ConnectionBanner show={!connectionOk} />
        <div className="h-10 w-10 animate-pulse rounded-full bg-elevated" />
      </main>
    );
  }

  if (tickets.length === 0) {
    return (
      <main className="kds-theme flex min-h-screen items-center justify-center bg-background px-6">
        <ConnectionBanner show={!connectionOk} />
        <p className="text-xl text-muted-foreground">Nenhum ticket na fila.</p>
      </main>
    );
  }

  return (
    <main className="kds-theme min-h-screen bg-background p-4">
      <ConnectionBanner show={!connectionOk} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tickets.map((ticket) => (
          <div key={ticket.id} className="rounded-lg border border-border-strong bg-surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[13px] font-medium tracking-widest text-muted-foreground uppercase">
                {ticket.status === 'queued'
                  ? 'Novo'
                  : ticket.status === 'preparing'
                    ? 'Em preparo'
                    : 'Pronto'}
              </span>
              {ticket.recallCount > 0 ? (
                <span className="text-[13px] text-danger">Recall ×{ticket.recallCount}</span>
              ) : null}
            </div>
            <ul className="mb-4 flex flex-col gap-2">
              {ticket.items.map((item) =>
                item.status === 'cancelled' ? (
                  <li
                    key={item.id}
                    className="rounded-md p-1"
                    style={{
                      backgroundColor: 'color-mix(in oklch, var(--danger) 14%, transparent)',
                    }}
                  >
                    <p className="text-xl font-semibold text-danger line-through">
                      {item.quantity}× {item.name}
                    </p>
                    <p className="text-sm font-medium tracking-wide text-danger uppercase">
                      Cancelado
                    </p>
                  </li>
                ) : (
                  <li key={item.id}>
                    <p className="text-xl font-semibold text-foreground">
                      {item.quantity}× {item.name}
                    </p>
                    {item.notes ? (
                      <p className="text-base text-muted-foreground">{item.notes}</p>
                    ) : null}
                  </li>
                ),
              )}
            </ul>
            {ticket.status === 'queued' ? (
              <button
                type="button"
                onClick={() => bump(ticket.id, 'start')}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-card-warm py-4 text-lg font-medium text-card-warm-foreground"
              >
                <Play className="h-5 w-5" strokeWidth={2} />
                Iniciar preparo
              </button>
            ) : ticket.status === 'preparing' ? (
              <button
                type="button"
                onClick={() => bump(ticket.id, 'ready')}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-card-warm py-4 text-lg font-medium text-card-warm-foreground"
              >
                <Bell className="h-5 w-5" strokeWidth={2} />
                Marcar pronto
              </button>
            ) : (
              <button
                type="button"
                onClick={() => bump(ticket.id, 'recall')}
                className="w-full rounded-lg border border-border-strong py-4 text-lg font-medium text-foreground"
              >
                Recall
              </button>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}

/**
 * Banner "sem conexão" (M20, ACTIVE_PLAN.md). Calmo, sem spinner (`FRONTEND_GUIDELINES.md`)
 * — o polling de segurança continua funcionando por trás, então isto é um aviso, não um
 * bloqueio: a tela nunca fica travada esperando o SSE voltar.
 */
function ConnectionBanner({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div
      role="status"
      className="mb-4 flex items-center gap-2 rounded-md border border-border-strong bg-elevated px-4 py-3 text-sm text-muted-foreground"
    >
      <WifiOff className="h-4 w-4 shrink-0" strokeWidth={1.5} />
      Sem conexão em tempo real — tentando reconectar. A lista continua atualizando sozinha.
    </div>
  );
}
