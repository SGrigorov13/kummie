import { productById, quoteCart, type Country, type Locale } from "@kummie/catalog";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Age = "unknown" | "under18" | "18plus";

export type Order = {
  id: string;
  createdAt: string;
  name: string;
  city: string;
  address: string;
  country: Country;
  lines: { productId: string; qty: number; title: string; exVat: number }[];
  exVat: number;
  vat: number;
  shipping: number;
  credit: number;
  total: number;
  points: number;
  step: number;
};

type Alerts = { comebacks: boolean; restocks: boolean; orders: boolean; drops: boolean };

export type KummieState = {
  locale: Locale;
  country: Country;
  promo: boolean;
  cookies: "unknown" | "essential";
  cart: { productId: string; qty: number }[];
  wishlist: string[];
  owned: string[];
  follows: string[];
  kummies: number;
  creditEur: number;
  history: { id: string; delta: number; noteBg: string; noteEn: string; at: string }[];
  orders: Order[];
  alerts: Alerts;
  age: Age;
  name: string;
};

const emptyAlerts: Alerts = { comebacks: false, restocks: false, orders: true, drops: false };

const initial: KummieState = {
  locale: "bg",
  country: "BG",
  promo: true,
  cookies: "unknown",
  cart: [],
  wishlist: [],
  owned: [],
  follows: [],
  kummies: 0,
  creditEur: 0,
  history: [],
  orders: [],
  alerts: emptyAlerts,
  age: "unknown",
  name: "",
};

const KEY = "kummie-local-v1";

function load(): KummieState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return initial;
    const parsed = JSON.parse(raw) as Partial<KummieState>;
    return {
      ...initial,
      ...parsed,
      alerts: { ...emptyAlerts, ...parsed.alerts },
      cart: parsed.cart ?? [],
      wishlist: parsed.wishlist ?? [],
      owned: parsed.owned ?? [],
      follows: parsed.follows ?? [],
      history: parsed.history ?? [],
      orders: parsed.orders ?? [],
    };
  } catch {
    return initial;
  }
}

type Store = {
  state: KummieState;
  quote: ReturnType<typeof quoteCart>;
  setLocale: (locale: Locale) => void;
  setCountry: (country: Country) => void;
  dismissPromo: () => void;
  acceptCookies: () => void;
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

const Ctx = createContext<Store | null>(null);

function toggleId(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<KummieState>(load);

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(state));
  }, [state]);

  const quote = useMemo(() => {
    const exVat = state.cart.reduce((sum, line) => {
      const product = productById(line.productId);
      return sum + (product ? product.priceExVat * line.qty : 0);
    }, 0);
    return quoteCart(exVat, state.country, state.creditEur);
  }, [state.cart, state.country, state.creditEur]);

  const api = useMemo<Store>(() => {
    return {
      state,
      quote,
      setLocale: (locale) => setState((s) => ({ ...s, locale })),
      setCountry: (country) => setState((s) => ({ ...s, country })),
      dismissPromo: () => setState((s) => ({ ...s, promo: false })),
      acceptCookies: () => setState((s) => ({ ...s, cookies: "essential" })),
      add: (productId) =>
        setState((s) => {
          const existing = s.cart.find((line) => line.productId === productId);
          const cart = existing
            ? s.cart.map((line) => (line.productId === productId ? { ...line, qty: line.qty + 1 } : line))
            : [...s.cart, { productId, qty: 1 }];
          return { ...s, cart };
        }),
      setQty: (productId, qty) =>
        setState((s) => ({
          ...s,
          cart: qty <= 0 ? s.cart.filter((line) => line.productId !== productId) : s.cart.map((line) => (line.productId === productId ? { ...line, qty } : line)),
        })),
      toggleWishlist: (productId) => setState((s) => ({ ...s, wishlist: toggleId(s.wishlist, productId) })),
      toggleOwned: (productId) => setState((s) => ({ ...s, owned: toggleId(s.owned, productId) })),
      toggleFollow: (groupId) => setState((s) => ({ ...s, follows: toggleId(s.follows, groupId) })),
      setAge: (age) => setState((s) => ({ ...s, age })),
      setName: (name) => setState((s) => ({ ...s, name })),
      toggleAlert: (key) => setState((s) => ({ ...s, alerts: { ...s.alerts, [key]: !s.alerts[key] } })),
      redeem: () =>
        setState((s) => {
          if (s.kummies < 500) return s;
          return {
            ...s,
            kummies: s.kummies - 500,
            creditEur: s.creditEur + 5,
            history: [
              { id: `h-${Date.now()}`, delta: -500, noteBg: "Обмяна за 5 € отстъпка", noteEn: "Redeemed for a €5 discount", at: new Date().toISOString() },
              ...s.history,
            ],
          };
        }),
      placeOrder: (input) => {
        if (state.cart.length === 0) return null;
        const id = `KM-${Date.now().toString(36).toUpperCase()}`;
        const lines = state.cart.flatMap((line) => {
          const product = productById(line.productId);
          if (!product) return [];
          return [{ productId: product.id, qty: line.qty, title: product.title, exVat: product.priceExVat }];
        });
        const order: Order = {
          id,
          createdAt: new Date().toISOString(),
          name: input.name.trim() || "Demo",
          city: input.city.trim() || "Sofia",
          address: input.address.trim() || "Local test",
          country: state.country,
          lines,
          exVat: quote.exVat,
          vat: quote.vat,
          shipping: quote.shipping,
          credit: quote.credit,
          total: quote.total,
          points: quote.points,
          step: 0,
        };
        setState((s) => ({
          ...s,
          name: order.name,
          cart: [],
          creditEur: Math.max(0, s.creditEur - quote.credit),
          kummies: s.kummies + quote.points,
          orders: [order, ...s.orders],
          history:
            quote.points > 0
              ? [{ id: `h-${id}`, delta: quote.points, noteBg: `От поръчка ${id}`, noteEn: `From order ${id}`, at: order.createdAt }, ...s.history]
              : s.history,
        }));
        return id;
      },
      advance: (orderId) =>
        setState((s) => ({
          ...s,
          orders: s.orders.map((order) => (order.id === orderId ? { ...order, step: Math.min(6, order.step + 1) } : order)),
        })),
      reset: () => {
        localStorage.removeItem(KEY);
        setState(initial);
      },
    };
  }, [quote, state]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useKummie(): Store {
  const store = useContext(Ctx);
  if (!store) throw new Error("Store missing");
  return store;
}
