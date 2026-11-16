import { Star } from "@kummie/brand/react";
import type { ProductCard } from "@kummie/contracts";
import type { Locale } from "@kummie/core";

type ShotSource = Pick<ProductCard, "categoryId" | "sourcing" | "image">;

/** Placeholder look by category (striped tile with KUMMIE's own star). */
function shotKind(product: ShotSource): "album" | "collect" | "original" | "merch" {
  if (product.categoryId === "albums") return "album";
  if (product.categoryId === "collector-supplies") return "collect";
  if (product.sourcing === "KUMMIE_ORIGINAL") return "original";
  return "merch";
}

/**
 * The product photo uploaded in the admin, or a striped placeholder. Never artist photos, album art
 * or logos in our own assets — only KUMMIE's star.
 */
export function ProductShot({ product, locale }: { product: ShotSource; locale: Locale }) {
  if (product.image) {
    return (
      // Plain <img>: product photos come from our own media host with fixed sizes (no layout shift).
      // oxlint-disable-next-line nextjs/no-img-element
      <img
        className="shot shot--photo"
        src={product.image.url}
        width={product.image.width}
        height={product.image.height}
        alt={product.image.alt[locale]}
        loading="lazy"
      />
    );
  }
  return (
    <div className={`shot shot--${shotKind(product)}`} aria-hidden="true">
      <span className="shot__label">product shot</span>
      <Star className="shot__star" />
    </div>
  );
}
