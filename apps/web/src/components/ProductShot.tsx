import { Star } from "@kummie/brand/react";
import { demoCategoryOf, type Product } from "@kummie/core";

/**
 * Striped placeholder where the product photo will go. Never artist photos, album art or logos —
 * only KUMMIE's own star.
 */
export function ProductShot({ product }: { product: Product }) {
  return (
    <div className={`shot shot--${demoCategoryOf(product)}`} aria-hidden="true">
      <span className="shot__label">product shot</span>
      <Star className="shot__star" />
    </div>
  );
}
