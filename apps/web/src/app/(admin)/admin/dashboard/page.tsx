'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
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
        <p className="text-sm text-muted-foreground">Carregando…</p>
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
    <main className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-lg rounded-md border border-border bg-surface p-8">
        <h1 className="mb-1 text-xl font-semibold text-foreground">Sessão ativa</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Confirmação de que o login (M2) funciona de ponta a ponta a partir do front (M4).
        </p>
        <dl className="mb-6 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Nome</dt>
          <dd className="text-foreground">{state.me.user.name}</dd>
          <dt className="text-muted-foreground">Email</dt>
          <dd className="text-foreground">{state.me.user.email}</dd>
          <dt className="text-muted-foreground">Sessão expira</dt>
          <dd className="font-mono-tabular text-foreground">
            {new Date(state.me.session.expiresAt).toLocaleString('pt-BR')}
          </dd>
        </dl>
        <button
          type="button"
          onClick={handleLogout}
          className="rounded-md border border-border-strong px-4 py-2 text-sm font-medium text-foreground"
        >
          Sair
        </button>
      </div>
    </main>
  );
}
