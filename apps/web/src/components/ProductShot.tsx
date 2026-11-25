import { Star } from "@kummie/brand/react";
import type { ProductCard, ProductImage } from "@kummie/contracts";
import type { Locale } from "@kummie/core";

type ShotSource = Pick<ProductCard, "categoryId" | "sourcing" | "image">;

/** Placeholder look by category (striped tile with KUMMIE's own star). */
function shotKind(product: ShotSource): "album" | "collect" | "original" | "merch" {
  if (product.categoryId === "albums") return "album";
  if (product.categoryId === "collector-supplies") return "collect";
  if (product.sourcing === "KUMMIE_ORIGINAL") return "original";
  return "merch";
}

/** One uploaded photo: AVIF or WebP in the width the screen needs (D-061). */
export function ProductPhoto({
  image,
  locale,
  sizes,
  eager = false,
  className = "shot shot--photo",
}: {
  image: ProductImage;
  locale: Locale;
  /** Display width hint for the browser, e.g. "(min-width: 768px) 40vw, 100vw". */
  sizes: string;
  eager?: boolean;
  className?: string;
}) {
  return (
    <picture>
      {image.sources.map((source) => (
        <source key={source.type} type={source.type} srcSet={source.srcset} sizes={sizes} />
      ))}
      {/* Plain <img>: photos come from our own media host in fixed sizes (no layout shift). */}
      {/* oxlint-disable-next-line nextjs/no-img-element */}
      <img
        className={className}
        src={image.url}
        width={image.width}
        height={image.height}
        alt={image.alt[locale]}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
      />
    </picture>
  );
}

/** Product cards: 2 columns on phones, 3 on tablets, 4 on wide screens. */
export const CARD_SIZES = "(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw";

/**
 * The product photo uploaded in the admin, or a striped placeholder. Never artist photos, album art
 * or logos in our own assets — only KUMMIE's star.
 */
export function ProductShot({
  product,
  locale,
  sizes = CARD_SIZES,
  eager = false,
}: {
  product: ShotSource;
  locale: Locale;
  sizes?: string;
  eager?: boolean;
}) {
  if (product.image)
    return <ProductPhoto image={product.image} locale={locale} sizes={sizes} eager={eager} />;
  return (
    <div className={`shot shot--${shotKind(product)}`} aria-hidden="true">
      <span className="shot__label">product shot</span>
      <Star className="shot__star" />
    </div>
  );
}
