'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, apiFetch } from './api';

interface TenantSummary {
  id: string;
  slug: string;
  name: string;
}

type TenantState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'empty' }
  | { status: 'ok'; tenant: TenantSummary };

const TenantContext = createContext<TenantState>({ status: 'loading' });

/**
 * Resolve o tenant ativo via `GET /v1/me/tenants` (ADR-030) e disponibiliza via
 * contexto para qualquer tela de admin que precise do `X-Tenant-Id`. Escopo do M5
 * (ACTIVE_PLAN.md): sem seletor — usa o primeiro tenant do usuário. Suficiente para o
 * caso real de hoje (um tenant por usuário); múltiplos tenants é produto de Fase G.
 */
export function TenantProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<TenantState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ tenants: TenantSummary[] }>('/v1/me/tenants')
      .then(({ tenants }) => {
        if (cancelled) return;
        const tenant = tenants[0];
        setState(tenant ? { status: 'ok', tenant } : { status: 'empty' });
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

  return <TenantContext.Provider value={state}>{children}</TenantContext.Provider>;
}

export function useTenant(): TenantState {
  return useContext(TenantContext);
}
