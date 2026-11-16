import type { ProductCard as CardData } from "@kummie/contracts";
import type { Locale } from "@kummie/core";
import Link from "next/link";
import { href } from "@/lib/paths";
import { Badge } from "./Badge";
import { Price } from "./Price";
import { ProductShot } from "./ProductShot";

/** 3:4 image · group · title (2 lines) · one sourcing badge · price · at most one state badge. */
export function ProductCard({ product, locale }: { product: CardData; locale: Locale }) {
  const url = href(locale, `/shop/${product.slug}`);
  return (
    <article className="card">
      <Link href={url} className="card__media" tabIndex={-1} aria-hidden="true">
        <ProductShot product={product} locale={locale} />
      </Link>
      <div className="card__body">
        {product.groupName ? <p className="label">{product.groupName}</p> : null}
        <h3 className="card__title">
          <Link href={url}>{product.title}</Link>
        </h3>
        <div className="badges">
          <Badge id={product.sourcing} locale={locale} />
        </div>
        <Price cents={product.priceCents} locale={locale} />
        {product.stateBadge ? (
          <div className="badges">
            <Badge id={product.stateBadge} locale={locale} />
          </div>
        ) : null}
      </div>
    </article>
  );
}
