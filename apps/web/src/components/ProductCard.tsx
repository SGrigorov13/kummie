import { groupById, stateBadgeOf, type Locale, type Product } from "@kummie/core";
import Link from "next/link";
import { href } from "@/lib/paths";
import { Badge } from "./Badge";
import { Price } from "./Price";
import { ProductShot } from "./ProductShot";

/** 3:4 image · title (2 lines) · one sourcing badge · price · at most one state badge. */
export function ProductCard({ product, locale }: { product: Product; locale: Locale }) {
  const stateBadge = stateBadgeOf(product);
  const group = groupById(product.groupId);
  const url = href(locale, `/shop/${product.id}`);
  return (
    <article className="card">
      <Link href={url} className="card__media" tabIndex={-1} aria-hidden="true">
        <ProductShot product={product} />
      </Link>
      <div className="card__body">
        {group ? <p className="label">{group.name}</p> : null}
        <h3 className="card__title">
          <Link href={url}>{product.title}</Link>
        </h3>
        <div className="badges">
          <Badge id={product.sourcing} locale={locale} />
        </div>
        <Price exVatCents={product.priceExVatCents} />
        {stateBadge ? (
          <div className="badges">
            <Badge id={stateBadge} locale={locale} />
          </div>
        ) : null}
      </div>
    </article>
  );
}
