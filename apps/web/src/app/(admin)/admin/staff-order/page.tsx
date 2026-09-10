'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, Loader2, Minus, Plus, Send } from 'lucide-react';
import { TenantProvider, useTenant } from '@/lib/tenant';
import { ApiError, apiFetch } from '@/lib/api';

interface OpenTab {
  tabId: string;
  tabLabel: string;
  tableLabel: string;
}
interface Product {
  id: string;
  name: string;
  basePriceCents: number;
}

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Pedido lançado pela equipe (M11, DOMAIN_MODEL.md §1.5) — consome a MESMA
 * `POST /v1/orders` do M8 (`source: 'staff'`); só faltava a tela.
 */
export default function StaffOrderPage() {
  return (
    <TenantProvider>
      <StaffOrderContent />
    </TenantProvider>
  );
}

function StaffOrderContent() {
  const tenant = useTenant();
  const tenantId = tenant.status === 'ok' ? tenant.tenant.id : null;

  const [tabs, setTabs] = useState<OpenTab[] | null>(null);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState('');
  const [cart, setCart] = useState<Record<string, number>>({});
  const [sending, setSending] = useState(false);
  const [sentMessage, setSentMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    const headers = { 'x-tenant-id': tenantId };
    Promise.all([
      apiFetch<{ tabs: OpenTab[] }>('/v1/tabs/open', { headers }),
      apiFetch<{ products: Product[] }>('/v1/catalog/products', { headers }),
    ])
      .then(([tabsRes, productsRes]) => {
        setTabs(tabsRes.tabs);
        setProducts(productsRes.products);
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : 'Não foi possível carregar.');
      });
  }, [tenantId]);

  if (tenant.status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-pulse rounded-full bg-elevated" />
      </div>
    );
  }
  if (tenant.status === 'error') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <p role="alert" className="flex items-center gap-2 text-sm text-danger">
          <AlertCircle className="h-4 w-4" strokeWidth={1.5} />
          {tenant.message}
        </p>
      </main>
    );
  }
  if (!tenantId) return null;

  const items = Object.entries(cart).filter(([, qty]) => qty > 0);
  const totalCents = items.reduce((sum, [productId, qty]) => {
    const product = products?.find((p) => p.id === productId);
    return sum + (product?.basePriceCents ?? 0) * qty;
  }, 0);

  async function handleSend() {
    if (!tenantId || !selectedTab || items.length === 0) return;
    setSending(true);
    setError(null);
    setSentMessage(null);
    try {
      await apiFetch('/v1/orders', {
        method: 'POST',
        headers: { 'x-tenant-id': tenantId, 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({
          tabId: selectedTab,
          items: items.map(([productId, quantity]) => ({ productId, quantity })),
        }),
      });
      setCart({});
      setSentMessage('Pedido lançado.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível lançar o pedido.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-4">
        <p className="text-[11px] font-medium tracking-widest text-muted-foreground uppercase">
          Salão
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground">
          Pedido pela equipe
        </h1>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-8">
        {error ? (
          <p role="alert" className="mb-4 flex items-center gap-2 text-sm text-danger">
            <AlertCircle className="h-4 w-4 shrink-0" strokeWidth={1.5} />
            {error}
          </p>
        ) : null}
        {sentMessage ? <p className="mb-4 text-sm text-success">{sentMessage}</p> : null}

        {!tabs || !products ? (
          <div className="h-20 animate-pulse rounded-md bg-elevated" />
        ) : tabs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma comanda aberta no momento.</p>
        ) : (
          <>
            <div className="mb-6 flex flex-col gap-1.5">
              <label className="text-[11px] font-medium tracking-widest text-muted-foreground uppercase">
                Comanda
              </label>
              <select
                value={selectedTab}
                onChange={(e) => setSelectedTab(e.target.value)}
                className="rounded-md border border-input bg-elevated px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="" disabled>
                  Selecione uma mesa
                </option>
                {tabs.map((t) => (
                  <option key={t.tabId} value={t.tabId}>
                    {t.tableLabel} — {t.tabLabel}
                  </option>
                ))}
              </select>
            </div>

            <ul className="mb-6 flex flex-col gap-2">
              {products.map((product) => {
                const quantity = cart[product.id] ?? 0;
                return (
                  <li
                    key={product.id}
                    className="flex items-center justify-between rounded-md border border-border bg-surface p-3"
                  >
                    <div>
                      <p className="text-sm text-foreground">{product.name}</p>
                      <p className="font-mono-tabular text-sm text-muted-foreground">
                        {currency.format(product.basePriceCents / 100)}
                      </p>
                    </div>
                    <div className="flex h-9 items-center gap-2 rounded-md border border-border-strong px-1">
                      <button
                        type="button"
                        onClick={() =>
                          setCart((c) => ({ ...c, [product.id]: Math.max(0, quantity - 1) }))
                        }
                        className="flex h-7 w-7 items-center justify-center text-foreground"
                        aria-label={`Remover uma unidade de ${product.name}`}
                      >
                        <Minus className="h-3.5 w-3.5" strokeWidth={2} />
                      </button>
                      <span className="font-mono-tabular w-4 text-center text-sm text-foreground">
                        {quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => setCart((c) => ({ ...c, [product.id]: quantity + 1 }))}
                        className="flex h-7 w-7 items-center justify-center text-foreground"
                        aria-label={`Adicionar uma unidade de ${product.name}`}
                      >
                        <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>

            <button
              type="button"
              onClick={handleSend}
              disabled={sending || !selectedTab || items.length === 0}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-brand px-4 py-3 text-sm font-medium text-brand-foreground disabled:opacity-60"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
              ) : (
                <>
                  <Send className="h-4 w-4" strokeWidth={1.5} />
                  Lançar pedido · {currency.format(totalCents / 100)}
                </>
              )}
            </button>
          </>
        )}
      </main>
    </div>
  );
}
