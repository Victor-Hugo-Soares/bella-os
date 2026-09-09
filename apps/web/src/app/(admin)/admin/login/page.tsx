'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowRight, Loader2, Lock, Mail } from 'lucide-react';
import { BellaMark } from '@/components/bella-mark';
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
    <main className="grid min-h-screen lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      <section className="relative hidden overflow-hidden bg-surface lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(oklch(100% 0 0 / 0.05) 1px, transparent 1px), linear-gradient(90deg, oklch(100% 0 0 / 0.05) 1px, transparent 1px)',
            backgroundSize: '40px 40px',
            maskImage: 'radial-gradient(ellipse 80% 60% at 30% 20%, black 40%, transparent 100%)',
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-32 -left-24 h-96 w-96 rounded-full bg-brand-soft blur-3xl"
        />

        <div className="relative flex items-center gap-2.5 text-foreground">
          <BellaMark className="h-8 w-8" />
          <span className="font-display text-lg font-semibold tracking-tight">Bella OS</span>
        </div>

        <div className="relative max-w-md">
          <h1 className="font-display text-3xl leading-tight font-semibold tracking-tight text-foreground">
            Uma operação inteira, do QR da mesa ao fechamento do caixa.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            Pedido do cliente, produção na cozinha e conta no caixa — um único sistema, sem
            planilha, sem retrabalho, sem pedido perdido numa sexta lotada.
          </p>
        </div>

        <p className="relative text-xs tracking-widest text-muted-foreground uppercase">
          Bella III · Franco da Rocha / SP
        </p>
      </section>

      <section className="flex items-center justify-center bg-background px-6 py-16">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 text-foreground lg:hidden">
            <BellaMark className="h-7 w-7" />
            <span className="font-display text-base font-semibold tracking-tight">Bella OS</span>
          </div>

          <h2 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            Entrar
          </h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Use seu email e senha de acesso da equipe.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="email"
                className="text-[11px] font-medium tracking-widest text-muted-foreground uppercase"
              >
                Email
              </label>
              <div className="relative">
                <Mail
                  className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  strokeWidth={1.5}
                />
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="voce@bella.com.br"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-md border border-input bg-elevated py-2.5 pr-3 pl-9 text-sm text-foreground outline-none transition-shadow placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="password"
                className="text-[11px] font-medium tracking-widest text-muted-foreground uppercase"
              >
                Senha
              </label>
              <div className="relative">
                <Lock
                  className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  strokeWidth={1.5}
                />
                <input
                  id="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-md border border-input bg-elevated py-2.5 pr-3 pl-9 text-sm text-foreground outline-none transition-shadow placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>

            {status === 'error' && error ? (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-md px-3 py-2.5 text-sm text-danger"
                style={{ backgroundColor: 'color-mix(in oklch, var(--danger) 12%, transparent)' }}
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.5} />
                <span>{error}</span>
              </p>
            ) : null}

            <button
              type="submit"
              disabled={status === 'loading'}
              className="mt-1 flex items-center justify-center gap-2 rounded-md bg-brand px-4 py-2.5 text-sm font-medium text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {status === 'loading' ? (
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
              ) : (
                <>
                  Entrar
                  <ArrowRight className="h-4 w-4" strokeWidth={2} />
                </>
              )}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
