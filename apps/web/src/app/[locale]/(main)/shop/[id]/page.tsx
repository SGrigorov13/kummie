import {
  badgeSpec,
  categoryOf,
  groupById,
  productById,
  products,
  stateBadgeOf,
  subcategoryById,
} from "@kummie/core";
import { t } from "@kummie/i18n";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/Badge";
import { Price } from "@/components/Price";
import { ProductShot } from "@/components/ProductShot";
import { href, localeParam } from "@/lib/paths";
import { ProductActions } from "./ProductActions";

type Props = { params: Promise<{ locale: string; id: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return products.map((product) => ({ id: product.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, id } = await params;
  const product = productById(id);
  return product ? { title: product.title, description: product.summary[localeParam(locale)] } : {};
}

/**
 * Product page. Renders every GPSR Art. 19 field: exact version, sourcing classification, dispatch
 * estimate, delivery regions, manufacturer, EU responsible person, safety information/warnings and
 * return exceptions — with an explicit "none" line instead of hiding an empty field.
 */
export default async function ProductPage({ params }: Props) {
  const { locale: rawLocale, id } = await params;
  const locale = localeParam(rawLocale);
  const product = productById(id);
  if (!product) notFound();

  const stateBadge = stateBadgeOf(product);
  const group = groupById(product.groupId);
  const sub = subcategoryById(product.subcategory);
  const { compliance } = product;
  const hasSafety = Boolean(compliance.safetyInfo) || (compliance.warnings?.length ?? 0) > 0;

  return (
    <div className="wrap section product">
      <div className="product__media">
        <ProductShot product={product} />
      </div>
      <div className="product__info">
        <p className="label">
          <Link href={href(locale, `/shop?cat=${categoryOf(product.subcategory).id}&sub=${sub.id}`)}>
            {sub[locale]}
          </Link>
          {group ? ` · ${group.name}` : ""}
        </p>
        <h1 className="product__title">{product.title}</h1>
        <div className="badges">
          <Badge id={product.sourcing} locale={locale} />
          {stateBadge ? <Badge id={stateBadge} locale={locale} /> : null}
        </div>
        <p className="demo-line">{t(locale, "demo")}</p>
        <Price exVatCents={product.priceExVatCents} large />
        <p>{product.summary[locale]}</p>
        <ProductActions productId={product.id} />

        <h2 className="h3">{t(locale, "facts")}</h2>
        <dl className="facts">
          <div>
            <dt>{t(locale, "version")}</dt>
            <dd>{product.version}</dd>
          </div>
          <div>
            <dt>{t(locale, "sourcing")}</dt>
            <dd>
              {badgeSpec(product.sourcing)[locale]} — {t(locale, `sourcing.${product.sourcing}`)}
            </dd>
          </div>
          <div>
            <dt>{t(locale, "dispatch")}</dt>
            <dd>{product.dispatchEstimate[locale]}</dd>
          </div>
          <div>
            <dt>{t(locale, "regions")}</dt>
            <dd>{product.deliveryRegions.map((country) => t(locale, `country.${country}`)).join(", ")}</dd>
          </div>
          <div>
            <dt>{t(locale, "maker")}</dt>
            <dd>{compliance.manufacturer}</dd>
          </div>
          <div>
            <dt>{t(locale, "responsible")}</dt>
            <dd>{compliance.responsiblePerson}</dd>
          </div>
          <div>
            <dt>{t(locale, "safety")}</dt>
            <dd>
              {hasSafety ? (
                <ul className="plain">
                  {compliance.safetyInfo ? <li>{compliance.safetyInfo[locale]}</li> : null}
                  {compliance.warnings?.map((warning) => (
                    <li key={warning.en}>{warning[locale]}</li>
                  ))}
                </ul>
              ) : (
                t(locale, "noWarnings")
              )}
            </dd>
          </div>
          <div>
            <dt>{t(locale, "returnsNote")}</dt>
            <dd>
              {product.returnExceptions?.length ? (
                <ul className="plain">
                  {product.returnExceptions.map((note) => (
                    <li key={note.en}>{note[locale]}</li>
                  ))}
                </ul>
              ) : (
                t(locale, "noReturnExceptions")
              )}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
