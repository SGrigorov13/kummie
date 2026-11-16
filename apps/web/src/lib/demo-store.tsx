"use client";

/**
 * Local demo state for the M0 storefront: cart, wishlist, collection, Kummies, demo orders and
 * notification opt-ins, kept in this browser's localStorage only.
 *
 * This is the ONLY place the storefront keeps commerce state. M1 replaces this module with the
 * API client (packages/contracts) without touching the pages: keep the `useDemoStore()` shape.
 */
import {
  nextHappyStatus,
  productById,
  quoteCart,
  redeemKummies,
  type OrderStatus,
  type Quote,
  type ShippingCountry,
} from "@kummie/core";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Age = "unknown" | "under18" | "18plus";

export type DemoOrder = {
  id: string;
  createdAt: string;
  name: string;
  city: string;
  address: string;
  country: ShippingCountry;
  lines: { productId: string; qty: number; title: string; priceCents: number }[];
  quote: Quote;
  status: OrderStatus;
};

export type Alerts = { comebacks: boolean; restocks: boolean; orders: boolean; drops: boolean };

export type HistoryEntry =
  | { id: string; kind: "earn"; delta: number; orderId: string; at: string }
  | { id: string; kind: "redeem"; delta: number; at: string };

export type DemoState = {
  country: ShippingCountry;
  cookies: "unknown" | "essential";
  cart: { productId: string; qty: number }[];
  wishlist: string[];
  owned: string[];
  follows: string[];
  kummies: number;
  creditCents: number;
  history: HistoryEntry[];
  orders: DemoOrder[];
  alerts: Alerts;
  age: Age;
  name: string;
};

const defaultAlerts: Alerts = { comebacks: false, restocks: false, orders: true, drops: false };

export const initialDemoState: DemoState = {
  country: "BG",
  cookies: "unknown",
  cart: [],
  wishlist: [],
  owned: [],
  follows: [],
  kummies: 0,
  creditCents: 0,
  history: [],
  orders: [],
  alerts: defaultAlerts,
  age: "unknown",
  name: "",
};

/** v2: money moved to integer cents. v1 (prototype, floats) is deliberately not migrated. */
const STORAGE_KEY = "kummie-local-v2";

function load(): DemoState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialDemoState;
    const parsed = JSON.parse(raw) as Partial<DemoState>;
    return {
      ...initialDemoState,
      ...parsed,
      alerts: { ...defaultAlerts, ...parsed.alerts },
    };
  } catch {
    return initialDemoState;
  }
}

function toggleId(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
}

type DemoStore = {
  state: DemoState;
  /** False during server render and the first client render (state is still the default). */
  hydrated: boolean;
  quote: Quote;
  cartCount: number;
  setCountry: (country: ShippingCountry) => void;
  acceptEssentialCookies: () => void;
  add: (productId: string) => void;
  setQty: (productId: string, qty: number) => void;
  toggleWishlist: (productId: string) => void;
  toggleOwned: (productId: string) => void;
  toggleFollow: (groupId: string) => void;
  setAge: (age: Age) => void;
  setName: (name: string) => void;
  toggleAlert: (key: keyof Alerts) => void;
  redeem: () => void;
  placeOrder: (input: { name: string; city: string; address: string }) => string | null;
  advance: (orderId: string) => void;
  reset: () => void;
};

const Ctx = createContext<DemoStore | null>(null);

export function DemoStoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DemoState>(initialDemoState);
  const [hydrated, setHydrated] = useState(false);

  // localStorage is an external system that does not exist during server render, so the saved state
  // can only be read after mount; reading it in a lazy initialiser would break hydration.
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    setState(load());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage full or blocked: the demo keeps working in memory.
    }
  }, [hydrated, state]);

  const quote = useMemo(() => {
    const lines = state.cart.flatMap((line) => {
      const product = productById(line.productId);
      return product ? [{ priceCents: product.priceCents, qty: line.qty }] : [];
    });
    return quoteCart(lines, state.country, state.creditCents);
  }, [state.cart, state.country, state.creditCents]);

  const update = useCallback((fn: (s: DemoState) => DemoState) => setState(fn), []);

  const placeOrder = useCallback(
    (input: { name: string; city: string; address: string }): string | null => {
      if (state.cart.length === 0) return null;
      const id = `KM-${Date.now().toString(36).toUpperCase()}`;
      const createdAt = new Date().toISOString();
      const lines = state.cart.flatMap((line) => {
        const product = productById(line.productId);
        return product
          ? [
              {
                productId: product.id,
                qty: line.qty,
                title: product.title,
                priceCents: product.priceCents,
              },
            ]
          : [];
      });
      const order: DemoOrder = {
        id,
        createdAt,
        name: input.name.trim(),
        city: input.city.trim(),
        address: input.address.trim(),
        country: state.country,
        lines,
        quote,
        status: "paid",
      };
      setState((s) => ({
        ...s,
        name: order.name,
        cart: [],
        creditCents: Math.max(0, s.creditCents - quote.creditCents),
        kummies: s.kummies + quote.kummies,
        orders: [order, ...s.orders],
        history:
          quote.kummies > 0
            ? [
                { id: `h-${id}`, kind: "earn", delta: quote.kummies, orderId: id, at: createdAt },
                ...s.history,
              ]
            : s.history,
      }));
      return id;
    },
    [quote, state.cart, state.country],
  );

  const api = useMemo<DemoStore>(
    () => ({
      state,
      hydrated,
      quote,
      cartCount: state.cart.reduce((sum, line) => sum + line.qty, 0),
      setCountry: (country) => update((s) => ({ ...s, country })),
      acceptEssentialCookies: () => update((s) => ({ ...s, cookies: "essential" })),
      add: (productId) =>
        update((s) => {
          const existing = s.cart.find((line) => line.productId === productId);
          const cart = existing
            ? s.cart.map((line) => (line.productId === productId ? { ...line, qty: line.qty + 1 } : line))
            : [...s.cart, { productId, qty: 1 }];
          return { ...s, cart };
        }),
      setQty: (productId, qty) =>
        update((s) => ({
          ...s,
          cart:
            !Number.isInteger(qty) || qty <= 0
              ? s.cart.filter((line) => line.productId !== productId)
              : s.cart.map((line) =>
                  line.productId === productId ? { ...line, qty: Math.min(qty, 99) } : line,
                ),
        })),
      toggleWishlist: (productId) => update((s) => ({ ...s, wishlist: toggleId(s.wishlist, productId) })),
      toggleOwned: (productId) => update((s) => ({ ...s, owned: toggleId(s.owned, productId) })),
      toggleFollow: (groupId) => update((s) => ({ ...s, follows: toggleId(s.follows, groupId) })),
      setAge: (age) => update((s) => ({ ...s, age })),
      setName: (name) => update((s) => ({ ...s, name })),
      toggleAlert: (key) => update((s) => ({ ...s, alerts: { ...s.alerts, [key]: !s.alerts[key] } })),
      redeem: () =>
        update((s) => {
          const result = redeemKummies(s.kummies);
          if (!result) return s;
          const at = new Date().toISOString();
          return {
            ...s,
            kummies: result.balance,
            creditCents: s.creditCents + result.creditCents,
            history: [
              { id: `h-${Date.now()}`, kind: "redeem", delta: result.balance - s.kummies, at },
              ...s.history,
            ],
          };
        }),
      placeOrder,
      advance: (orderId) =>
        update((s) => ({
          ...s,
          orders: s.orders.map((order) => {
            if (order.id !== orderId) return order;
            const next = nextHappyStatus(order.status);
            return next ? { ...order, status: next } : order;
          }),
        })),
      reset: () => {
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch {
          // ignore
        }
        setState(initialDemoState);
      },
    }),
    [hydrated, placeOrder, quote, state, update],
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useDemoStore(): DemoStore {
  const store = useContext(Ctx);
  if (!store) throw new Error("useDemoStore must be used inside <DemoStoreProvider>");
  return store;
}
