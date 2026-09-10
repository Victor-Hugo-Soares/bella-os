'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Bell, ChefHat, Play } from 'lucide-react';
import { ApiError, apiFetch } from '@/lib/api';

const DEVICE_TOKEN_STORAGE_KEY = 'bella_kds_device_token';
const POLL_FALLBACK_MS = 5000;

interface TicketItem {
  id: string;
  name: string;
  quantity: number;
  notes: string | null;
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
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-6">
      <ChefHat className="h-10 w-10 text-foreground" strokeWidth={1.5} />
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
          className="rounded-md border border-input bg-elevated px-4 py-3 text-center text-2xl tracking-widest text-foreground outline-none focus:ring-2 focus:ring-ring"
        />
        {error ? (
          <p role="alert" className="text-center text-sm text-danger">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pairing}
          className="rounded-md bg-brand px-4 py-3 text-sm font-medium text-brand-foreground disabled:opacity-60"
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
    source.addEventListener('order.created', () => void load());

    return () => {
      clearInterval(pollTimer);
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
      <main className="flex min-h-screen items-center justify-center bg-background px-6">
        <p role="alert" className="flex items-center gap-2 text-lg text-danger">
          <AlertCircle className="h-6 w-6" strokeWidth={1.5} />
          {error}
        </p>
      </main>
    );
  }

  if (!tickets) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-10 w-10 animate-pulse rounded-full bg-elevated" />
      </main>
    );
  }

  if (tickets.length === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6">
        <p className="text-xl text-muted-foreground">Nenhum ticket na fila.</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background p-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tickets.map((ticket) => (
          <div key={ticket.id} className="rounded-md border border-border-strong bg-surface p-4">
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
              {ticket.items.map((item) => (
                <li key={item.id}>
                  <p className="text-xl font-semibold text-foreground">
                    {item.quantity}× {item.name}
                  </p>
                  {item.notes ? (
                    <p className="text-base text-muted-foreground">{item.notes}</p>
                  ) : null}
                </li>
              ))}
            </ul>
            {ticket.status === 'queued' ? (
              <button
                type="button"
                onClick={() => bump(ticket.id, 'start')}
                className="flex w-full items-center justify-center gap-2 rounded-md bg-brand py-4 text-lg font-medium text-brand-foreground"
              >
                <Play className="h-5 w-5" strokeWidth={2} />
                Iniciar
              </button>
            ) : ticket.status === 'preparing' ? (
              <button
                type="button"
                onClick={() => bump(ticket.id, 'ready')}
                className="flex w-full items-center justify-center gap-2 rounded-md bg-success py-4 text-lg font-medium text-brand-foreground"
              >
                <Bell className="h-5 w-5" strokeWidth={2} />
                Pronto
              </button>
            ) : (
              <button
                type="button"
                onClick={() => bump(ticket.id, 'recall')}
                className="w-full rounded-md border border-border-strong py-4 text-lg font-medium text-foreground"
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
