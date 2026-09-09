'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, LogOut, Mail, User } from 'lucide-react';
import { BellaMark } from '@/components/bella-mark';
import { ApiError, apiFetch, authFetch } from '@/lib/api';

interface MeResponse {
  user: { id: string; email: string; name: string };
  session: { id: string; expiresAt: string };
}

/**
 * Prova de ponta a ponta do M2+M4: busca `/v1/me` (rota própria, sessão via cookie
 * cross-origin) para confirmar que o login funcionou de verdade, não só que o
 * formulário "enviou". Sem `X-Tenant-Id` ainda — `/v1/me` não exige tenant (só
 * autenticação); a escolha de tenant é UI da Fase B.
 */
export default function DashboardPage() {
  const router = useRouter();
  const [state, setState] = useState<
    { status: 'loading' } | { status: 'error'; message: string } | { status: 'ok'; me: MeResponse }
  >({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    apiFetch<MeResponse>('/v1/me')
      .then((me) => {
        if (!cancelled) setState({ status: 'ok', me });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.code === 'UNAUTHENTICATED') {
          router.replace('/admin/login');
          return;
        }
        setState({
          status: 'error',
          message: err instanceof Error ? err.message : 'Erro desconhecido.',
        });
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleLogout() {
    await authFetch('/api/auth/sign-out', { method: 'POST' });
    router.replace('/admin/login');
  }

  if (state.status === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-pulse rounded-full bg-elevated" />
      </main>
    );
  }

  if (state.status === 'error') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <p role="alert" className="text-sm text-danger">
          {state.message}
        </p>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-2.5 text-foreground">
          <BellaMark className="h-6 w-6" />
          <span className="font-display text-sm font-semibold tracking-tight">Bella OS</span>
          <span className="ml-1 rounded-full border border-border-strong px-2 py-0.5 text-[11px] tracking-wide text-muted-foreground uppercase">
            Bella III
          </span>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="flex items-center gap-1.5 rounded-md border border-border-strong px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-elevated"
        >
          <LogOut className="h-3.5 w-3.5" strokeWidth={1.5} />
          Sair
        </button>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        <p className="text-[11px] font-medium tracking-widest text-muted-foreground uppercase">
          Conta
        </p>
        <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-foreground">
          {state.me.user.name}
        </h1>

        <div className="mt-6 flex items-center gap-1.5 text-sm text-success">
          <span className="h-1.5 w-1.5 rounded-full bg-success" />
          Sessão ativa
        </div>

        <dl className="mt-8 divide-y divide-border rounded-md border border-border bg-surface">
          <div className="flex items-center gap-3 px-4 py-3.5">
            <User className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
            <dt className="w-32 shrink-0 text-sm text-muted-foreground">Nome</dt>
            <dd className="text-sm text-foreground">{state.me.user.name}</dd>
          </div>
          <div className="flex items-center gap-3 px-4 py-3.5">
            <Mail className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
            <dt className="w-32 shrink-0 text-sm text-muted-foreground">Email</dt>
            <dd className="font-mono-tabular text-sm text-foreground">{state.me.user.email}</dd>
          </div>
          <div className="flex items-center gap-3 px-4 py-3.5">
            <Clock className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
            <dt className="w-32 shrink-0 text-sm text-muted-foreground">Sessão expira</dt>
            <dd className="font-mono-tabular text-sm text-foreground">
              {new Date(state.me.session.expiresAt).toLocaleString('pt-BR')}
            </dd>
          </div>
        </dl>

        <p className="mt-6 text-sm text-muted-foreground">
          Confirmação de que o login (M2) funciona de ponta a ponta a partir do front (M4).
          Catálogo, mesas e pedidos chegam a partir do M5.
        </p>
      </main>
    </div>
  );
}
