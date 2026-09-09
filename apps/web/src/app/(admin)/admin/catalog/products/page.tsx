'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, Loader2, Plus } from 'lucide-react';
import { useTenant } from '@/lib/tenant';
import { ApiError, apiFetch } from '@/lib/api';

interface Station {
  id: string;
  name: string;
}
interface Category {
  id: string;
  name: string;
}
interface Product {
  id: string;
  name: string;
  basePriceCents: number;
  categoryId: string;
  stationId: string;
  isActive: boolean;
  isAvailable: boolean;
}

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; products: Product[]; categories: Category[]; stations: Station[] };

/**
 * Produtos do cardápio (M5, DOMAIN_MODEL.md §1.3). Precisa de categoria + estação já
 * cadastradas (`/admin/catalog/categories`, `/admin/catalog/stations`) — o formulário
 * mostra isso explicitamente em vez de deixar o `select` vazio sem explicação.
 */
export default function ProductsPage() {
  const tenant = useTenant();
  const tenantId = tenant.status === 'ok' ? tenant.tenant.id : null;

  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [stationId, setStationId] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  async function load(id: string) {
    setState({ status: 'loading' });
    try {
      const headers = { 'x-tenant-id': id };
      const [productsRes, categoriesRes, stationsRes] = await Promise.all([
        apiFetch<{ products: Product[] }>('/v1/catalog/products?includeInactive=true', { headers }),
        apiFetch<{ categories: Category[] }>('/v1/catalog/categories', { headers }),
        apiFetch<{ stations: Station[] }>('/v1/catalog/stations', { headers }),
      ]);
      setState({
        status: 'ok',
        products: productsRes.products,
        categories: categoriesRes.categories,
        stations: stationsRes.stations,
      });
    } catch (err) {
      setState({
        status: 'error',
        message: err instanceof ApiError ? err.message : 'Não foi possível carregar.',
      });
    }
  }

  useEffect(() => {
    if (tenantId) void load(tenantId);
  }, [tenantId]);

  if (!tenantId) return null;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!tenantId) return;
    setCreating(true);
    setCreateError(null);
    try {
      const cents = Math.round(Number(price.replace(',', '.')) * 100);
      await apiFetch('/v1/catalog/products', {
        method: 'POST',
        headers: { 'x-tenant-id': tenantId },
        body: JSON.stringify({ name, basePriceCents: cents, categoryId, stationId }),
      });
      setName('');
      setPrice('');
      await load(tenantId);
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Não foi possível criar.');
    } finally {
      setCreating(false);
    }
  }

  async function toggleAvailability(product: Product) {
    if (!tenantId) return;
    await apiFetch(`/v1/catalog/products/${product.id}/availability`, {
      method: 'PATCH',
      headers: { 'x-tenant-id': tenantId },
      body: JSON.stringify({ isAvailable: !product.isAvailable }),
    });
    await load(tenantId);
  }

  if (state.status === 'loading') {
    return (
      <div className="flex flex-col gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-11 animate-pulse rounded-md bg-elevated" />
        ))}
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <p role="alert" className="flex items-center gap-2 text-sm text-danger">
        <AlertCircle className="h-4 w-4" strokeWidth={1.5} />
        {state.message}
      </p>
    );
  }

  if (state.categories.length === 0 || state.stations.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Cadastre pelo menos uma categoria e uma estação antes de criar um produto — veja as abas
        acima.
      </p>
    );
  }

  return (
    <div>
      <form onSubmit={handleCreate} className="mb-6 grid grid-cols-2 gap-3">
        <div className="col-span-2 flex flex-col gap-1.5">
          <label className="text-[11px] font-medium tracking-widest text-muted-foreground uppercase">
            Nome do produto
          </label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-md border border-input bg-elevated px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-medium tracking-widest text-muted-foreground uppercase">
            Preço (R$)
          </label>
          <input
            required
            inputMode="decimal"
            placeholder="0,00"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="font-mono-tabular rounded-md border border-input bg-elevated px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-medium tracking-widest text-muted-foreground uppercase">
            Estação
          </label>
          <select
            required
            value={stationId}
            onChange={(e) => setStationId(e.target.value)}
            className="rounded-md border border-input bg-elevated px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="" disabled>
              Selecione
            </option>
            {state.stations.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-medium tracking-widest text-muted-foreground uppercase">
            Categoria
          </label>
          <select
            required
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="rounded-md border border-input bg-elevated px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="" disabled>
              Selecione
            </option>
            {state.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={creating}
          className="col-span-2 flex items-center justify-center gap-1.5 rounded-md bg-brand px-4 py-2 text-sm font-medium text-brand-foreground disabled:opacity-60"
        >
          {creating ? (
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
          ) : (
            <Plus className="h-4 w-4" strokeWidth={2} />
          )}
          Adicionar produto
        </button>
      </form>
      {createError ? (
        <p role="alert" className="mb-4 flex items-center gap-2 text-sm text-danger">
          <AlertCircle className="h-4 w-4 shrink-0" strokeWidth={1.5} />
          {createError}
        </p>
      ) : null}

      {state.products.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum produto cadastrado ainda.</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border bg-surface">
          {state.products.map((product) => (
            <li key={product.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <span
                  className={`text-sm ${product.isActive ? 'text-foreground' : 'text-muted-foreground line-through'}`}
                >
                  {product.name}
                </span>
                <span className="font-mono-tabular ml-3 text-sm text-muted-foreground">
                  {currency.format(product.basePriceCents / 100)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => toggleAvailability(product)}
                className="text-xs font-medium tracking-wide text-muted-foreground uppercase hover:text-foreground"
              >
                {product.isAvailable ? 'Esgotar' : 'Repor'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
