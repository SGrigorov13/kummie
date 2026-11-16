"use client";

import type { ProductCard } from "@kummie/contracts";
import { useEffect, useState } from "react";
import { catalogueApi } from "./shop";

/**
 * Product cards for a list of product addresses (slugs) kept in the browser — wishlist, collection,
 * Ask KUMMIE picks. Products that are no longer published are simply left out.
 */
export function useProductCards(slugs: readonly string[]): ProductCard[] | null {
  const [cards, setCards] = useState<ProductCard[] | null>(null);
  const key = slugs.join("|");

  useEffect(() => {
    let alive = true;
    const list = key ? key.split("|") : [];
    Promise.all(list.map((slug) => catalogueApi.getProduct(slug).catch(() => null))).then((found) => {
      if (alive) setCards(found.filter((p): p is NonNullable<typeof p> => p !== null));
    });
    return () => {
      alive = false;
    };
  }, [key]);

  return cards;
}
