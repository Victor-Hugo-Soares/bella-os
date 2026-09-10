'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, Loader2, Plus } from 'lucide-react';
import { ApiError, apiFetch } from '@/lib/api';

interface ResourceRow {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

type ListState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; rows: ResourceRow[] };

/**
 * CRUD genérico para entidades simples do catálogo (nome + ordem + ativo/inativo) —
 * hoje usado por estações e categorias, que têm exatamente essa forma. Produtos têm
 * campos extras (preço, categoria, estação) e ganham sua própria tela.
 * Estados obrigatórios (`FRONTEND_GUIDELINES.md §7`): loading, vazio, erro, sucesso.
 */
export function ResourceCrud({
  tenantId,
  basePath,
  entityLabel,
  createLabel,
  extraCreateFields,
}: {
  tenantId: string;
  basePath: string;
  entityLabel: string;
  createLabel: string;
  extraCreateFields?: Record<string, unknown>;
}) {
  const [state, setState] = useState<ListState>({ status: 'loading' });
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const listKey = basePath.split('/').pop()!;

  async function load() {
    setState({ status: 'loading' });
    try {
      const data = await apiFetch<Record<string, ResourceRow[]>>(
        `${basePath}?includeInactive=true`,
        {
          headers: { 'x-tenant-id': tenantId },
        },
      );
      setState({ status: 'ok', rows: data[listKey] ?? [] });
    } catch (err) {
      setState({
        status: 'error',
        message: err instanceof ApiError ? err.message : 'Não foi possível carregar.',
      });
    }
  }

  useEffect(() => {
    void load();
  }, [tenantId, basePath]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      await apiFetch(basePath, {
        method: 'POST',
        headers: { 'x-tenant-id': tenantId },
        body: JSON.stringify({ name, ...extraCreateFields }),
      });
      setName('');
      await load();
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Não foi possível criar.');
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(row: ResourceRow) {
    await apiFetch(`${basePath}/${row.id}`, {
      method: 'PATCH',
      headers: { 'x-tenant-id': tenantId },
      body: JSON.stringify({ isActive: !row.isActive }),
    });
    await load();
  }

  return (
    <div>
      <form onSubmit={handleCreate} className="mb-6 flex items-end gap-3">
        <div className="flex flex-1 flex-col gap-1.5">
          <label className="text-[11px] font-medium tracking-widest text-muted-foreground uppercase">
            {createLabel}
          </label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-md border border-input bg-elevated px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <button
          type="submit"
          disabled={creating}
          className="flex items-center gap-1.5 rounded-md bg-brand px-4 py-2 text-sm font-medium text-brand-foreground disabled:opacity-60"
        >
          {creating ? (
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
          ) : (
            <Plus className="h-4 w-4" strokeWidth={2} />
          )}
          Adicionar
        </button>
      </form>
      {createError ? (
        <p role="alert" className="mb-4 flex items-center gap-2 text-sm text-danger">
          <AlertCircle className="h-4 w-4 shrink-0" strokeWidth={1.5} />
          {createError}
        </p>
      ) : null}

      {state.status === 'loading' ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-11 animate-pulse rounded-md bg-elevated" />
          ))}
        </div>
      ) : state.status === 'error' ? (
        <p role="alert" className="flex items-center gap-2 text-sm text-danger">
          <AlertCircle className="h-4 w-4" strokeWidth={1.5} />
          {state.message}
        </p>
      ) : state.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum(a) {entityLabel.toLowerCase()} cadastrado(a) ainda.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border-strong bg-surface shadow-[0_8px_24px_rgba(0,0,0,.03)]">
          {state.rows.map((row) => (
            <li key={row.id} className="flex items-center justify-between px-4 py-3">
              <span
                className={`text-sm ${row.isActive ? 'text-foreground' : 'text-muted-foreground line-through'}`}
              >
                {row.name}
              </span>
              <button
                type="button"
                onClick={() => toggleActive(row)}
                className="text-xs font-medium tracking-wide text-muted-foreground uppercase hover:text-foreground"
              >
                {row.isActive ? 'Desativar' : 'Reativar'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
