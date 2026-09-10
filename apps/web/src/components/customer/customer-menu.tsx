'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Bell,
  Loader2,
  Minus,
  Plus,
  Receipt,
  ShoppingBag,
  UtensilsCrossed,
} from 'lucide-react';
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
interface CustomerOrder {
  id: string;
  sequenceNumber: number;
  status: string;
  totalCents: number;
  submittedAt: string;
  items: Array<{ id: string; name: string; quantity: number; status: string }>;
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
const ORDERS_POLL_MS = 3000;

// Cobre status de PEDIDO (orders.status) e de ITEM (order_items.status) — os dois
// conjuntos de valores são parecidos mas não idênticos (achado real testando em
// browser: 'queued' de item aparecia cru na tela por não estar neste mapa).
const ORDER_STATUS_LABEL: Record<string, string> = {
  submitted: 'Aguardando confirmação',
  accepted: 'Confirmado',
  in_production: 'Em preparo',
  queued: 'Na fila',
  preparing: 'Em preparo',
  ready: 'Pronto',
  delivered: 'Entregue',
  rejected: 'Não aceito',
  cancelled: 'Cancelado',
};

/**
 * Cardápio do cliente (M7) + envio de pedido, acompanhamento e chamados (M10).
 * Mobile-first (`FRONTEND_GUIDELINES.md §5`): uma coluna, alvo de toque ≥ 44px, CTA
 * fixo no rodapé. Sem modificador ainda (escopo cortado desde o M7).
 */
export function CustomerMenu({ tenantSlug, tableCode }: { tenantSlug: string; tableCode: string }) {
  const [session, setSession] = useState<SessionState>({ status: 'loading' });
  const [catalog, setCatalog] = useState<CatalogState>({ status: 'loading' });
  const [screen, setScreen] = useState<'menu' | 'product' | 'cart' | 'orders'>('menu');
  const [activeProduct, setActiveProduct] = useState<Product | null>(null);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const tenantName = tenantSlug.charAt(0).toUpperCase() + tenantSlug.slice(1);

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

  if (session.status === 'ok' && screen === 'cart') {
    return (
      <CartScreen
        tenantSlug={tenantSlug}
        tableSessionId={session.tableSessionId}
        onBack={() => setScreen('menu')}
        onSent={() => setScreen('orders')}
      />
    );
  }

  if (session.status === 'ok' && screen === 'orders') {
    return <OrdersScreen tenantSlug={tenantSlug} onBack={() => setScreen('menu')} />;
  }

  if (session.status === 'ok' && screen === 'product' && activeProduct) {
    return (
      <ProductDetailScreen
        product={activeProduct}
        tableSessionId={session.tableSessionId}
        onBack={() => setScreen('menu')}
      />
    );
  }

  const sortedCategories =
    catalog.status === 'ok'
      ? [...catalog.categories].sort((a, b) => a.sortOrder - b.sortOrder)
      : [];

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="border-b border-border bg-surface px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-brand-foreground">
              <BellaMark className="h-5 w-5" />
            </span>
            <div>
              <p className="text-base font-semibold tracking-tight text-foreground">{tenantName}</p>
              {session.status === 'ok' ? (
                <p className="text-xs text-muted-foreground">{session.tableLabel}</p>
              ) : (
                <div className="mt-1 h-3 w-16 animate-pulse rounded bg-elevated" />
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 text-xs font-medium text-success">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              Aberto
            </span>
            {session.status === 'ok' ? (
              <button
                type="button"
                onClick={() => setScreen('orders')}
                className="text-xs font-medium tracking-wide text-muted-foreground uppercase hover:text-foreground"
              >
                Meus pedidos
              </button>
            ) : null}
          </div>
        </div>

        {sortedCategories.length > 0 ? (
          <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4">
            <CategoryChip
              label="Todos"
              active={activeCategoryId === null}
              onClick={() => setActiveCategoryId(null)}
            />
            {sortedCategories.map((category) => (
              <CategoryChip
                key={category.id}
                label={category.name}
                active={activeCategoryId === category.id}
                onClick={() => setActiveCategoryId(category.id)}
              />
            ))}
          </div>
        ) : null}
      </header>

      {catalog.status === 'loading' ? (
        <div className="flex flex-col gap-3 px-4 py-6">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-elevated" />
          ))}
        </div>
      ) : catalog.products.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
          O cardápio ainda não tem itens disponíveis.
        </p>
      ) : (
        <MenuList
          categories={
            activeCategoryId
              ? sortedCategories.filter((c) => c.id === activeCategoryId)
              : sortedCategories
          }
          products={catalog.products}
          tableSessionId={session.status === 'ok' ? session.tableSessionId : null}
          onOpenProduct={(product) => {
            setActiveProduct(product);
            setScreen('product');
          }}
        />
      )}

      {session.status === 'ok' ? (
        <CartBar tableSessionId={session.tableSessionId} onOpenCart={() => setScreen('cart')} />
      ) : null}
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

function ScreenHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <header className="flex items-center gap-3 border-b border-border px-4 py-4">
      <button
        type="button"
        onClick={onBack}
        aria-label="Voltar"
        className="flex h-9 w-9 items-center justify-center text-foreground"
      >
        <ArrowLeft className="h-5 w-5" strokeWidth={1.5} />
      </button>
      <h1 className="text-lg font-semibold tracking-tight text-foreground">{title}</h1>
    </header>
  );
}

function CategoryChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-lg px-3.5 py-2 text-sm font-medium whitespace-nowrap ${
        active
          ? 'bg-brand text-brand-foreground'
          : 'border border-border-strong bg-surface text-foreground'
      }`}
    >
      {label}
    </button>
  );
}

function ProductPhotoPlaceholder({ className = 'h-full w-full' }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center bg-card-warm ${className}`}>
      <UtensilsCrossed className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} />
    </div>
  );
}

function MenuList({
  categories,
  products,
  tableSessionId,
  onOpenProduct,
}: {
  categories: Category[];
  products: Product[];
  tableSessionId: string | null;
  onOpenProduct: (product: Product) => void;
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
            <h2 className="mb-3 text-lg font-semibold tracking-tight text-foreground">
              {category.name}
            </h2>
            <div className="flex flex-col gap-3">
              {items.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  tableSessionId={tableSessionId}
                  onOpen={() => onOpenProduct(product)}
                />
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
  onOpen,
}: {
  product: Product;
  tableSessionId: string | null;
  onOpen: () => void;
}) {
  // Div com role="button", não um <button>: o card precisa conter os controles de
  // quantidade, que são botões próprios — <button> dentro de <button> é HTML inválido
  // (o browser conserta sozinho de forma imprevisível). role="button" + teclado dá a
  // mesma semântica de clique sem aninhar elementos interativos.
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      aria-label={`Ver detalhes de ${product.name}`}
      className="flex cursor-pointer items-start gap-3 rounded-lg border border-border-strong bg-surface p-3 text-left shadow-[0_8px_24px_rgba(0,0,0,.03)]"
    >
      <ProductPhotoPlaceholder className="h-16 w-16 shrink-0 rounded-md" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{product.name}</p>
        {product.description ? (
          <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{product.description}</p>
        ) : null}
        <p className="font-mono-tabular mt-1.5 text-sm font-semibold text-foreground">
          {currency.format(product.basePriceCents / 100)}
        </p>
      </div>
      {tableSessionId ? (
        <div onClick={(e) => e.stopPropagation()} className="shrink-0">
          <QuantityControl product={product} tableSessionId={tableSessionId} />
        </div>
      ) : null}
    </div>
  );
}

function ProductDetailScreen({
  product,
  tableSessionId,
  onBack,
}: {
  product: Product;
  tableSessionId: string;
  onBack: () => void;
}) {
  return (
    <div className="min-h-screen bg-background pb-28">
      <ScreenHeader title="Detalhes do produto" onBack={onBack} />
      <ProductPhotoPlaceholder className="h-56 w-full" />
      <div className="px-4 py-5">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{product.name}</h1>
        {product.description ? (
          <p className="mt-2 text-sm text-muted-foreground">{product.description}</p>
        ) : null}
        <p className="font-mono-tabular mt-3 text-lg font-semibold text-foreground">
          {currency.format(product.basePriceCents / 100)}
        </p>
      </div>
      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-surface px-4 py-3">
        <QuantityControl product={product} tableSessionId={tableSessionId} full />
      </div>
    </div>
  );
}

function QuantityControl({
  product,
  tableSessionId,
  full = false,
}: {
  product: Product;
  tableSessionId: string;
  /** Variante de rodapé da tela de detalhe: botão/stepper ocupa a largura toda. */
  full?: boolean;
}) {
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
        className={
          full
            ? 'flex h-12 w-full items-center justify-center gap-2 rounded-md bg-brand text-sm font-medium text-brand-foreground'
            : 'flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-brand text-brand-foreground'
        }
        aria-label={`Adicionar ${product.name}`}
      >
        <Plus className="h-5 w-5" strokeWidth={2} />
        {full ? 'Adicionar ao carrinho' : null}
      </button>
    );
  }

  return (
    <div
      className={
        full
          ? 'flex h-12 w-full items-center justify-between gap-2 rounded-md border border-border-strong px-2'
          : 'flex h-11 shrink-0 items-center gap-2 rounded-md border border-border-strong px-1'
      }
    >
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

function CartBar({
  tableSessionId,
  onOpenCart,
}: {
  tableSessionId: string;
  onOpenCart: () => void;
}) {
  const store = useCartStore(tableSessionId);
  const items = store((s) => s.items);
  const count = items.reduce((sum, i) => sum + i.quantity, 0);
  if (count === 0) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 border-t border-border bg-surface px-4 py-3">
      <button
        type="button"
        onClick={onOpenCart}
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

function CartScreen({
  tenantSlug,
  tableSessionId,
  onBack,
  onSent,
}: {
  tenantSlug: string;
  tableSessionId: string;
  onBack: () => void;
  onSent: () => void;
}) {
  const store = useCartStore(tableSessionId);
  const items = store((s) => s.items);
  const idempotencyKey = store((s) => s.idempotencyKey);
  const incrementItem = store((s) => s.incrementItem);
  const decrementItem = store((s) => s.decrementItem);
  const clear = store((s) => s.clear);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend() {
    if (!idempotencyKey) return;
    setSending(true);
    setError(null);
    try {
      await apiFetch(`/public/${tenantSlug}/orders`, {
        method: 'POST',
        headers: { 'idempotency-key': idempotencyKey },
        body: JSON.stringify({
          items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        }),
      });
      clear();
      onSent();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível enviar o pedido.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="min-h-screen bg-background pb-28">
      <ScreenHeader title="Seu carrinho" onBack={onBack} />
      {items.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">Carrinho vazio.</p>
      ) : (
        <div className="flex flex-col gap-3 px-4 py-6">
          {items.map((item) => (
            <div
              key={item.productId}
              className="flex items-center justify-between rounded-lg border border-border-strong bg-surface p-4 shadow-[0_8px_24px_rgba(0,0,0,.03)]"
            >
              <div>
                <p className="text-sm font-medium text-foreground">{item.name}</p>
                <p className="font-mono-tabular text-sm text-muted-foreground">
                  {currency.format((item.unitPriceCents * item.quantity) / 100)}
                </p>
              </div>
              <div className="flex h-11 items-center gap-2 rounded-md border border-border-strong px-1">
                <button
                  type="button"
                  onClick={() => decrementItem(item.productId)}
                  className="flex h-9 w-9 items-center justify-center text-foreground"
                  aria-label={`Remover uma unidade de ${item.name}`}
                >
                  <Minus className="h-4 w-4" strokeWidth={2} />
                </button>
                <span className="font-mono-tabular w-4 text-center text-sm text-foreground">
                  {item.quantity}
                </span>
                <button
                  type="button"
                  onClick={() => incrementItem(item.productId)}
                  className="flex h-9 w-9 items-center justify-center text-foreground"
                  aria-label={`Adicionar uma unidade de ${item.name}`}
                >
                  <Plus className="h-4 w-4" strokeWidth={2} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {error ? (
        <p role="alert" className="mx-4 mb-4 flex items-center gap-2 text-sm text-danger">
          <AlertCircle className="h-4 w-4 shrink-0" strokeWidth={1.5} />
          {error}
        </p>
      ) : null}

      {items.length > 0 ? (
        <div className="fixed inset-x-0 bottom-0 border-t border-border bg-surface px-4 py-3">
          <button
            type="button"
            onClick={handleSend}
            disabled={sending}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-brand px-4 py-3 text-sm font-medium text-brand-foreground disabled:opacity-60"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
            ) : (
              <>Enviar pedido · {currency.format(cartTotalCents(items) / 100)}</>
            )}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function OrdersScreen({ tenantSlug, onBack }: { tenantSlug: string; onBack: () => void }) {
  const [orders, setOrders] = useState<CustomerOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requestSent, setRequestSent] = useState<'call_waiter' | 'request_bill' | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ orders: CustomerOrder[] }>(`/public/${tenantSlug}/orders`);
      setOrders(data.orders);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível carregar seus pedidos.');
    }
  }, [tenantSlug]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), ORDERS_POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  async function callService(kind: 'call_waiter' | 'request_bill') {
    try {
      await apiFetch(`/public/${tenantSlug}/service-requests`, {
        method: 'POST',
        body: JSON.stringify({ kind }),
      });
      setRequestSent(kind);
    } catch {
      // silencioso de propósito: o botão já dá feedback visual; se falhar, o cliente
      // pode tentar de novo — não é uma ação crítica o bastante para travar a tela.
    }
  }

  return (
    <div className="min-h-screen bg-background pb-6">
      <ScreenHeader title="Meus pedidos" onBack={onBack} />

      <div className="flex gap-2 px-4 py-4">
        <button
          type="button"
          onClick={() => callService('call_waiter')}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border-strong px-3 py-2.5 text-sm font-medium text-foreground"
        >
          <Bell className="h-4 w-4" strokeWidth={1.5} />
          Chamar garçom
        </button>
        <button
          type="button"
          onClick={() => callService('request_bill')}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border-strong px-3 py-2.5 text-sm font-medium text-foreground"
        >
          <Receipt className="h-4 w-4" strokeWidth={1.5} />
          Pedir a conta
        </button>
      </div>
      {requestSent ? (
        <p className="px-4 pb-2 text-sm text-success">
          {requestSent === 'call_waiter' ? 'Garçom chamado.' : 'Conta solicitada.'}
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mx-4 flex items-center gap-2 text-sm text-danger">
          <AlertCircle className="h-4 w-4 shrink-0" strokeWidth={1.5} />
          {error}
        </p>
      ) : !orders ? (
        <div className="mx-4 h-20 animate-pulse rounded-md bg-elevated" />
      ) : orders.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
          Nenhum pedido enviado ainda.
        </p>
      ) : (
        <div className="flex flex-col gap-3 px-4">
          {orders.map((order) => (
            <div
              key={order.id}
              className="rounded-lg border border-border-strong bg-surface p-4 shadow-[0_8px_24px_rgba(0,0,0,.03)]"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">
                  Pedido #{order.sequenceNumber}
                </span>
                <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {ORDER_STATUS_LABEL[order.status] ?? order.status}
                </span>
              </div>
              <ul className="mb-2 flex flex-col gap-1">
                {order.items.map((item) => (
                  <li key={item.id} className="flex items-center justify-between text-sm">
                    <span className="text-foreground">
                      {item.quantity}× {item.name}
                    </span>
                    <span className="text-muted-foreground">
                      {ORDER_STATUS_LABEL[item.status] ?? item.status}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="font-mono-tabular text-sm text-foreground">
                {currency.format(order.totalCents / 100)}
              </p>
            </div>
          ))}
        </div>
      )}
      <p className="px-4 pt-4 text-center text-xs text-muted-foreground">
        Tempo de preparo é uma estimativa, pode variar conforme o movimento.
      </p>
    </div>
  );
}
