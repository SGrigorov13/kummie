"use client";

import { useState } from "react";
import { useDemoStore } from "@/lib/demo-store";
import { catalogueApi, shopApi, useCart } from "@/lib/shop";
import { useT } from "@/lib/locale";

export function ProductActions({ productId }: { productId: string }) {
  const t = useT();
  const { state, toggleWishlist, toggleOwned } = useDemoStore();
  const { setCart } = useCart();
  const [status, setStatus] = useState<"idle" | "adding" | "added" | "failed">("idle");

  /** The product page is still the prototype; the cart is real, so find the variant in the API. */
  async function addToCart() {
    setStatus("adding");
    try {
      const product = await catalogueApi.getProduct(productId);
      const variant = product.variants[0];
      if (!variant) throw new Error("no variant");
      setCart(await shopApi.setLine({ variantId: variant.id, qty: 1, add: true }));
      setStatus("added");
    } catch {
      setStatus("failed");
    }
  }
  const wished = state.wishlist.includes(productId);
  const owned = state.owned.includes(productId);
  return (
    <div className="row">
      <button type="button" className="btn" disabled={status === "adding"} onClick={addToCart}>
        {t("add")}
      </button>
      <button
        type="button"
        className="btn btn--secondary"
        aria-pressed={wished}
        onClick={() => toggleWishlist(productId)}
      >
        {t("wishlist")}
        {wished ? " ✓" : ""}
      </button>
      <button
        type="button"
        className="btn btn--secondary"
        aria-pressed={owned}
        onClick={() => toggleOwned(productId)}
      >
        {t("owned")}
        {owned ? " ✓" : ""}
      </button>
      <p className="sr-only" role="status">
        {status === "added" ? t("added") : status === "failed" ? t("shop.unavailable") : ""}
      </p>
    </div>
  );
}
