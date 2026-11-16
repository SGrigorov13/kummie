"use client";

import { useState } from "react";
import { useDemoStore } from "@/lib/demo-store";
import { useT } from "@/lib/locale";

export function ProductActions({ productId }: { productId: string }) {
  const t = useT();
  const { state, add, toggleWishlist, toggleOwned } = useDemoStore();
  const [added, setAdded] = useState(false);
  const wished = state.wishlist.includes(productId);
  const owned = state.owned.includes(productId);
  return (
    <div className="row">
      <button
        type="button"
        className="btn"
        onClick={() => {
          add(productId);
          setAdded(true);
        }}
      >
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
        {added ? t("added") : ""}
      </p>
    </div>
  );
}
