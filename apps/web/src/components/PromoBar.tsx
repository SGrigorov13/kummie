"use client";

import { Star } from "@kummie/brand/react";
import { PROMO_DISMISSED_KEY } from "@/lib/promo";
import { useT } from "@/lib/locale";
import { CloseIcon } from "./Icons";

/**
 * Site-wide promo bar (D-007): 48px, glow, dismissible region — not a fixed overlay.
 * Rendered only by the (main) route group layout, so it never exists on /[locale]/teen/**.
 */
function dismiss() {
  document.documentElement.dataset.promo = "off";
  try {
    localStorage.setItem(PROMO_DISMISSED_KEY, "1");
  } catch {
    // Hidden for this page view only.
  }
}

export function PromoBar() {
  const t = useT();
  return (
    <section className="promo" aria-label={t("promoRegion")}>
      <div className="promo__inner">
        <Star className="promo__star" />
        <p className="promo__text">{t("promoBar")}</p>
      </div>
      <button type="button" className="promo__close" onClick={dismiss} aria-label={t("dismiss")}>
        <CloseIcon />
      </button>
    </section>
  );
}
