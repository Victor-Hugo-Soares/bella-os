'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authFetch } from '@/lib/api';

/**
 * Login de staff (M4). Consome `/api/auth/sign-in/email` (M2) direto do navegador —
 * é a única forma real de provar que CORS + cookie de sessão funcionam entre `apps/web`
 * e `apps/api` (dois processos, duas origens em desenvolvimento). Loading/erro/sucesso
 * tratados conforme docs/FRONTEND_GUIDELINES.md §7.
 */
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('loading');
    setError(null);

    const result = await authFetch('/api/auth/sign-in/email', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    if (!result.ok) {
      setStatus('error');
      setError(result.message);
      return;
    }

    router.push('/admin/dashboard');
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-md border border-border bg-surface p-8 shadow-sm">
        <h1 className="mb-1 text-2xl font-semibold text-foreground">Bella OS</h1>
        <p className="mb-6 text-sm text-muted-foreground">Entre com seu email e senha.</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="email"
              className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-md border border-input bg-elevated px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="password"
              className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
            >
              Senha
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-md border border-input bg-elevated px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {status === 'error' && error ? (
            <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={status === 'loading'}
            className="mt-2 rounded-md bg-brand px-4 py-2 text-sm font-medium text-brand-foreground transition-opacity disabled:opacity-60"
          >
            {status === 'loading' ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </main>
  );
}
