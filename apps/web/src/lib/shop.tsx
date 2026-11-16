"use client";

import { createApiClient, createShopClient, type Cart } from "@kummie/contracts";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

/** Cart, checkout and orders (cookies on the API host, same site as the shop). */
export const shopApi = createShopClient({ baseUrl });
/** Public catalogue, used to find the variant behind a product page. */
export const catalogueApi = createApiClient({ baseUrl });

type CartContextValue = {
  cart: Cart | null;
  count: number;
  /** Replaces the cart with a fresh copy from an API answer. */
  setCart: (cart: Cart) => void;
  refresh: () => Promise<void>;
};

const CartContext = createContext<CartContextValue>({
  cart: null,
  count: 0,
  setCart: () => {},
  refresh: async () => {},
});

/** Server-side cart for the whole shop; the header count and the cart page read from here. */
export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<Cart | null>(null);
  const refresh = useCallback(async () => {
    try {
      setCart(await shopApi.cart());
    } catch {
      // API not reachable: the header shows 0 and the cart page explains.
    }
  }, []);
  useEffect(() => {
    shopApi.cart().then(setCart, () => undefined);
  }, []);
  const value = useMemo(() => ({ cart, count: cart?.count ?? 0, setCart, refresh }), [cart, refresh]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  return useContext(CartContext);
}

/** Reads a key from the URL fragment (#k=… for guest orders), which never reaches a server. */
export function fragmentValue(name: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.hash.slice(1)).get(name);
}
