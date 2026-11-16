"use client";

/**
 * Browser-only state for the parts that are not on the server yet: wishlist and "I have it"
 * (collection), followed groups and the Club's Kummies preview (M3), plus the cookie choice.
 * Kept in this browser's localStorage only. Cart, checkout, orders and the account live on the API
 * since M1 (see `lib/shop.tsx`, `lib/account.ts`).
 */
import { businessDay, KUMMIES_REDEEM_COST, redeemKummies, type KummiesLot } from "@kummie/core";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Age = "unknown" | "under18" | "18plus";

export type HistoryEntry =
  | { id: string; kind: "earn"; delta: number; orderId: string; at: string; validUntil: string }
  | { id: string; kind: "redeem"; delta: number; creditCents: number; at: string };

export type DemoState = {
  cookies: "unknown" | "essential";
  /** Product addresses (slugs). */
  wishlist: string[];
  owned: string[];
  follows: string[];
  /** Club preview until the Kummies ledger is shown in the account (M3). */
  kummieLots: KummiesLot[];
  creditCents: number;
  history: HistoryEntry[];
  age: Age;
};

export const initialDemoState: DemoState = {
  cookies: "unknown",
  wishlist: [],
  owned: [],
  follows: [],
  kummieLots: [],
  creditCents: 0,
  history: [],
  age: "unknown",
};

/** Same key as before: old demo fields (cart, orders) are simply ignored and dropped on save. */
const STORAGE_KEY = "kummie-local-v3";

function load(): DemoState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialDemoState;
    const parsed = JSON.parse(raw) as Partial<DemoState>;
    return {
      cookies: parsed.cookies ?? initialDemoState.cookies,
      wishlist: parsed.wishlist ?? [],
      owned: parsed.owned ?? [],
      follows: parsed.follows ?? [],
      kummieLots: parsed.kummieLots ?? [],
      creditCents: parsed.creditCents ?? 0,
      history: parsed.history ?? [],
      age: parsed.age ?? "unknown",
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
  /** Today's Bulgarian date (YYYY-MM-DD), set on the client after mount; "" before. */
  today: string;
  acceptEssentialCookies: () => void;
  toggleWishlist: (slug: string) => void;
  toggleOwned: (slug: string) => void;
  toggleFollow: (groupId: string) => void;
  setAge: (age: Age) => void;
  redeem: () => void;
};

const Ctx = createContext<DemoStore | null>(null);

export function DemoStoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DemoState>(initialDemoState);
  const [hydrated, setHydrated] = useState(false);
  const [today, setToday] = useState("");

  // localStorage is an external system that does not exist during server render, so the saved state
  // can only be read after mount; reading it in a lazy initialiser would break hydration.
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    setState(load());
    setToday(businessDay(new Date()));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage full or blocked: keeps working in memory.
    }
  }, [hydrated, state]);

  const update = useCallback((fn: (s: DemoState) => DemoState) => setState(fn), []);

  const api = useMemo<DemoStore>(
    () => ({
      state,
      hydrated,
      today,
      acceptEssentialCookies: () => update((s) => ({ ...s, cookies: "essential" })),
      toggleWishlist: (slug) => update((s) => ({ ...s, wishlist: toggleId(s.wishlist, slug) })),
      toggleOwned: (slug) => update((s) => ({ ...s, owned: toggleId(s.owned, slug) })),
      toggleFollow: (groupId) => update((s) => ({ ...s, follows: toggleId(s.follows, groupId) })),
      setAge: (age) => update((s) => ({ ...s, age })),
      redeem: () =>
        update((s) => {
          const now = new Date();
          const result = redeemKummies(s.kummieLots, businessDay(now));
          if (!result) return s;
          return {
            ...s,
            kummieLots: result.lots,
            creditCents: s.creditCents + result.creditCents,
            history: [
              {
                id: `h-${now.getTime()}`,
                kind: "redeem",
                delta: -KUMMIES_REDEEM_COST,
                creditCents: result.creditCents,
                at: now.toISOString(),
              },
              ...s.history,
            ],
          };
        }),
    }),
    [hydrated, state, today, update],
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useDemoStore(): DemoStore {
  const store = useContext(Ctx);
  if (!store) throw new Error("useDemoStore must be used inside <DemoStoreProvider>");
  return store;
}
