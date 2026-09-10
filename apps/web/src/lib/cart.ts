import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { persist } from 'zustand/middleware';

export interface CartItem {
  productId: string;
  name: string;
  unitPriceCents: number;
  quantity: number;
}

interface CartState {
  items: CartItem[];
  /**
   * Gerada ao montar o carrinho (primeiro item), ANTES de qualquer envio —
   * DOMAIN_MODEL.md §5: mesma chave em reenvios (double-tap, timeout+retry) garante
   * 1 pedido só no servidor (M8). Só é trocada por uma nova depois de um envio bem
   * sucedido (M8, ainda não existe aqui) — o carrinho deste milestone nunca envia.
   */
  idempotencyKey: string | null;
  addItem: (item: Omit<CartItem, 'quantity'>) => void;
  incrementItem: (productId: string) => void;
  decrementItem: (productId: string) => void;
  removeItem: (productId: string) => void;
  clear: () => void;
}

type CartStore = UseBoundStore<StoreApi<CartState>>;

/**
 * Um store por `tableSessionId` (cada mesa/sessão tem seu próprio carrinho no
 * localStorage) — cacheado em módulo para nunca recriar o store (e perder a
 * reatividade do Zustand) a cada re-render de componente.
 */
const storeCache = new Map<string, CartStore>();

function buildCartStore(tableSessionId: string): CartStore {
  return create<CartState>()(
    persist(
      (set) => ({
        items: [],
        idempotencyKey: null,
        addItem: (item) =>
          set((state) => {
            const idempotencyKey = state.idempotencyKey ?? crypto.randomUUID();
            const existing = state.items.find((i) => i.productId === item.productId);
            if (existing) {
              return {
                idempotencyKey,
                items: state.items.map((i) =>
                  i.productId === item.productId ? { ...i, quantity: i.quantity + 1 } : i,
                ),
              };
            }
            return { idempotencyKey, items: [...state.items, { ...item, quantity: 1 }] };
          }),
        incrementItem: (productId) =>
          set((state) => ({
            items: state.items.map((i) =>
              i.productId === productId ? { ...i, quantity: i.quantity + 1 } : i,
            ),
          })),
        decrementItem: (productId) =>
          set((state) => ({
            items: state.items
              .map((i) => (i.productId === productId ? { ...i, quantity: i.quantity - 1 } : i))
              .filter((i) => i.quantity > 0),
          })),
        removeItem: (productId) =>
          set((state) => ({ items: state.items.filter((i) => i.productId !== productId) })),
        clear: () => set({ items: [], idempotencyKey: null }),
      }),
      { name: `bella_cart_${tableSessionId}` },
    ),
  );
}

/**
 * Carrinho do cliente (M7): só estado de UI, client-side, persistido em localStorage
 * por sessão de mesa (`FRONTEND_GUIDELINES.md §6`: Zustand + `persist`). O total
 * exibido é só uma prévia — o servidor recalcula tudo do zero quando o pedido for de
 * fato criado (M8, `DOMAIN_MODEL.md §3`: total do cliente nunca é fonte de verdade).
 */
export function useCartStore(tableSessionId: string): CartStore {
  let store = storeCache.get(tableSessionId);
  if (!store) {
    store = buildCartStore(tableSessionId);
    storeCache.set(tableSessionId, store);
  }
  return store;
}

export function cartTotalCents(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);
}
