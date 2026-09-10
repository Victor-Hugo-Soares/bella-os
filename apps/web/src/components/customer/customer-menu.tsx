'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, Minus, Plus, ShoppingBag } from 'lucide-react';
import { BellaMark } from '@/components/bella-mark';
import { ApiError, apiFetch } from '@/lib/api';
import { cartTotalCents, useCartStore } from '@/lib/cart';

interface Category {
  id: string;
  name: string;
  sortOrder: number;
}
interface Product {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  basePriceCents: number;
  sortOrder: number;
}

type SessionState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; tableSessionId: string; tableLabel: string };

type CatalogState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; categories: Category[]; products: Product[] };

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Cardápio do cliente (M7). Mobile-first (`FRONTEND_GUIDELINES.md §5`): uma coluna,
 * alvo de toque ≥ 44px, CTA fixo no rodapé. Sem modificador, sem envio de pedido ainda
 * (escopo cortado no ACTIVE_PLAN.md M7) — carrinho é só estado local até o M8.
 */
export function CustomerMenu({ tenantSlug, tableCode }: { tenantSlug: string; tableCode: string }) {
  const [session, setSession] = useState<SessionState>({ status: 'loading' });
  const [catalog, setCatalog] = useState<CatalogState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ tableSessionId: string; tabId: string; tableLabel: string }>(
      `/public/${tenantSlug}/tables/${tableCode}/session`,
      { method: 'POST' },
    )
      .then((result) => {
        if (cancelled) return;
        setSession({
          status: 'ok',
          tableSessionId: result.tableSessionId,
          tableLabel: result.tableLabel,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setSession({
          status: 'error',
          message: err instanceof ApiError ? err.message : 'Não foi possível abrir a mesa.',
        });
      });
    return () => {
      cancelled = true;
    };
  }, [tenantSlug, tableCode]);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ categories: Category[]; products: Product[] }>(`/public/${tenantSlug}/catalog`)
      .then((data) => {
        if (!cancelled) setCatalog({ status: 'ok', ...data });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setCatalog({
          status: 'error',
          message: err instanceof ApiError ? err.message : 'Não foi possível carregar o cardápio.',
        });
      });
    return () => {
      cancelled = true;
    };
  }, [tenantSlug]);

  if (session.status === 'error') {
    return <ErrorScreen message={session.message} />;
  }
  if (catalog.status === 'error') {
    return <ErrorScreen message={catalog.message} />;
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="flex items-center gap-2.5 border-b border-border px-4 py-4">
        <BellaMark className="h-7 w-7 text-foreground" />
        {session.status === 'ok' ? (
          <span className="text-sm font-medium text-foreground">{session.tableLabel}</span>
        ) : (
          <div className="h-4 w-24 animate-pulse rounded bg-elevated" />
        )}
      </header>

      {catalog.status === 'loading' ? (
        <div className="flex flex-col gap-3 px-4 py-6">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-md bg-elevated" />
          ))}
        </div>
      ) : catalog.products.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
          O cardápio ainda não tem itens disponíveis.
        </p>
      ) : (
        <MenuList
          categories={catalog.categories}
          products={catalog.products}
          tableSessionId={session.status === 'ok' ? session.tableSessionId : null}
        />
      )}

      {session.status === 'ok' ? <CartBar tableSessionId={session.tableSessionId} /> : null}
    </div>
  );
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 bg-background px-6 text-center">
      <AlertCircle className="h-6 w-6 text-danger" strokeWidth={1.5} />
      <p className="text-sm text-danger">{message}</p>
    </main>
  );
}

function MenuList({
  categories,
  products,
  tableSessionId,
}: {
  categories: Category[];
  products: Product[];
  tableSessionId: string | null;
}) {
  const sortedCategories = [...categories].sort((a, b) => a.sortOrder - b.sortOrder);
  return (
    <div className="flex flex-col gap-8 px-4 py-6">
      {sortedCategories.map((category) => {
        const items = products
          .filter((p) => p.categoryId === category.id)
          .sort((a, b) => a.sortOrder - b.sortOrder);
        if (items.length === 0) return null;
        return (
          <section key={category.id}>
            <h2 className="mb-3 font-display text-lg font-semibold tracking-tight text-foreground">
              {category.name}
            </h2>
            <div className="flex flex-col gap-3">
              {items.map((product) => (
                <ProductCard key={product.id} product={product} tableSessionId={tableSessionId} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ProductCard({
  product,
  tableSessionId,
}: {
  product: Product;
  tableSessionId: string | null;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-border bg-surface p-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{product.name}</p>
        {product.description ? (
          <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{product.description}</p>
        ) : null}
        <p className="font-mono-tabular mt-1.5 text-sm text-foreground">
          {currency.format(product.basePriceCents / 100)}
        </p>
      </div>
      {tableSessionId ? <AddButton product={product} tableSessionId={tableSessionId} /> : null}
    </div>
  );
}

function AddButton({ product, tableSessionId }: { product: Product; tableSessionId: string }) {
  const store = useCartStore(tableSessionId);
  const quantity = store((s) => s.items.find((i) => i.productId === product.id)?.quantity ?? 0);
  const addItem = store((s) => s.addItem);
  const incrementItem = store((s) => s.incrementItem);
  const decrementItem = store((s) => s.decrementItem);

  if (quantity === 0) {
    return (
      <button
        type="button"
        onClick={() =>
          addItem({
            productId: product.id,
            name: product.name,
            unitPriceCents: product.basePriceCents,
          })
        }
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-brand text-brand-foreground"
        aria-label={`Adicionar ${product.name}`}
      >
        <Plus className="h-5 w-5" strokeWidth={2} />
      </button>
    );
  }

  return (
    <div className="flex h-11 shrink-0 items-center gap-2 rounded-md border border-border-strong px-1">
      <button
        type="button"
        onClick={() => decrementItem(product.id)}
        className="flex h-9 w-9 items-center justify-center text-foreground"
        aria-label={`Remover uma unidade de ${product.name}`}
      >
        <Minus className="h-4 w-4" strokeWidth={2} />
      </button>
      <span className="font-mono-tabular w-4 text-center text-sm text-foreground">{quantity}</span>
      <button
        type="button"
        onClick={() => incrementItem(product.id)}
        className="flex h-9 w-9 items-center justify-center text-foreground"
        aria-label={`Adicionar uma unidade de ${product.name}`}
      >
        <Plus className="h-4 w-4" strokeWidth={2} />
      </button>
    </div>
  );
}

function CartBar({ tableSessionId }: { tableSessionId: string }) {
  const store = useCartStore(tableSessionId);
  const items = store((s) => s.items);
  const count = items.reduce((sum, i) => sum + i.quantity, 0);
  if (count === 0) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 border-t border-border bg-surface px-4 py-3">
      <button
        type="button"
        className="flex w-full items-center justify-between rounded-md bg-brand px-4 py-3 text-sm font-medium text-brand-foreground"
      >
        <span className="flex items-center gap-2">
          <ShoppingBag className="h-4 w-4" strokeWidth={1.5} />
          Ver carrinho · {count} {count === 1 ? 'item' : 'itens'}
        </span>
        <span className="font-mono-tabular">{currency.format(cartTotalCents(items) / 100)}</span>
      </button>
    </div>
  );
}
