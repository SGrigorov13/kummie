"use client";

import { formatMoney } from "@kummie/core";
import { useState } from "react";
import { useDemoStore } from "@/lib/demo-store";
import { useLocale, useT } from "@/lib/locale";
import { shopApi, useCart } from "@/lib/shop";

type Variant = { id: string; version: string; priceCents: number };

/** Version choice (when there is more than one), add to cart, wishlist and "I have it". */
export function ProductActions({ slug, variants }: { slug: string; variants: Variant[] }) {
  const t = useT();
  const locale = useLocale();
  const { state, toggleWishlist, toggleOwned } = useDemoStore();
  const { setCart } = useCart();
  const [variantId, setVariantId] = useState(variants[0]?.id ?? "");
  const [status, setStatus] = useState<"idle" | "adding" | "added" | "failed">("idle");
  const wished = state.wishlist.includes(slug);
  const owned = state.owned.includes(slug);

  async function addToCart() {
    setStatus("adding");
    try {
      setCart(await shopApi.setLine({ variantId, qty: 1, add: true }));
      setStatus("added");
    } catch {
      setStatus("failed");
    }
  }

  return (
    <>
      {variants.length > 1 ? (
        <label className="select">
          <span>{t("version")}</span>
          <select value={variantId} onChange={(e) => setVariantId(e.target.value)}>
            {variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.version} — {formatMoney(v.priceCents, locale)}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <div className="row">
        <button
          type="button"
          className="btn"
          disabled={status === "adding" || !variantId}
          onClick={addToCart}
        >
          {t("add")}
        </button>
        <button
          type="button"
          className="btn btn--secondary"
          aria-pressed={wished}
          onClick={() => toggleWishlist(slug)}
        >
          {t("wishlist")}
          {wished ? " ✓" : ""}
        </button>
        <button
          type="button"
          className="btn btn--secondary"
          aria-pressed={owned}
          onClick={() => toggleOwned(slug)}
        >
          {t("owned")}
          {owned ? " ✓" : ""}
        </button>
      </div>
      <p className={status === "failed" ? "notice" : "muted"} role="status">
        {status === "added" ? t("added") : status === "failed" ? t("shop.unavailable") : ""}
      </p>
    </>
  );
}
