import type { DeliveryWindow } from "@kummie/contracts";
import { badgeSpec, formatDeliveryWindow } from "@kummie/core";
import { t } from "@kummie/i18n";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/Badge";
import { Price } from "@/components/Price";
import { ProductPhoto, ProductShot } from "@/components/ProductShot";
import { catalogue, subcategoryIndex, tryCatalogue } from "@/lib/catalogue-server";
import { href, localeParam } from "@/lib/paths";
import { ProductActions } from "./ProductActions";

/** The photo column is 5/12 of the page from 768 px (max ~1200 px wide), the full width below. */
const PRODUCT_SIZES = "(min-width: 768px) min(42vw, 500px), 100vw";
const THUMB_SIZES = "(min-width: 768px) 140px, 33vw";

type Props = { params: Promise<{ locale: string; id: string }> };

/** Rendered on first visit and refreshed every minute, so newly published products appear by themselves. */
// Refreshed every minute (ISR): must be a literal number for Next.js.
export const revalidate = 60;

const SLUG = /^[a-z0-9-]{1,80}$/;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, id } = await params;
  if (!SLUG.test(id)) return {};
  const product = await tryCatalogue(() => catalogue.getProduct(id));
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
  if (!SLUG.test(id)) notFound();
  const [product, categories] = await Promise.all([
    tryCatalogue(() => catalogue.getProduct(id)),
    tryCatalogue(() => catalogue.listCategories()),
  ]);
  if (!product) {
    return (
      <div className="wrap section narrow">
        <p className="notice">{t(locale, "shop.offline")}</p>
      </div>
    );
  }

  const sub = subcategoryIndex(categories?.items ?? []).get(product.subcategoryId);
  const { compliance } = product;
  const hasSafety = Boolean(compliance.safetyInfo) || compliance.warnings.length > 0;
  const versions = product.variants.map((v) => v.version).join(" · ");

  return (
    <div className="wrap section product">
      <div className="product__media">
        <ProductShot product={product} locale={locale} sizes={PRODUCT_SIZES} eager />
        {product.images.length > 1 ? (
          <div className="product__more">
            {product.images.slice(1).map((image) => (
              <ProductPhoto key={image.url} image={image} locale={locale} sizes={THUMB_SIZES} />
            ))}
          </div>
        ) : null}
      </div>
      <div className="product__info">
        <p className="label">
          {sub ? (
            <Link href={href(locale, `/shop?cat=${sub.category.id}&sub=${product.subcategoryId}`)}>
              {sub[locale]}
            </Link>
          ) : null}
          {product.groupName ? ` · ${product.groupName}` : ""}
        </p>
        <h1 className="product__title">{product.title}</h1>
        <div className="badges">
          <Badge id={product.sourcing} locale={locale} />
          {product.stateBadge ? <Badge id={product.stateBadge} locale={locale} /> : null}
        </div>
        {product.isDemo ? <p className="demo-line">{t(locale, "demo")}</p> : null}
        <Price cents={product.priceCents} locale={locale} large />
        <p className="muted price-note">
          {t(locale, "priceNote")} {t(locale, "deliveryFrom")}
        </p>
        <p>{product.summary[locale]}</p>
        <ProductActions slug={product.slug} variants={product.variants} />

        <h2 className="h3">{t(locale, "facts")}</h2>
        <dl className="facts">
          <div>
            <dt>{t(locale, "version")}</dt>
            <dd>{versions}</dd>
          </div>
          <div>
            <dt>{t(locale, "sourcing")}</dt>
            <dd>
              {badgeSpec(product.sourcing)[locale]} — {t(locale, `sourcing.${product.sourcing}`)}
            </dd>
          </div>
          <div>
            <dt>{t(locale, "dispatch")}</dt>
            <dd>
              {product.deliveryWindows.BG ? (
                <>
                  {(["BG", "RO", "GR"] as const)
                    .filter((c) => product.deliveryWindows[c] && compliance.deliveryRegions.includes(c))
                    .map((c) => (
                      <span key={c} style={{ display: "block" }}>
                        {t(locale, "delivery.expectedTo", {
                          country: t(locale, `country.${c}`),
                          window: formatDeliveryWindow(product.deliveryWindows[c] as DeliveryWindow, locale),
                        })}
                      </span>
                    ))}
                  <span className="muted" style={{ display: "block" }}>
                    {t(locale, "delivery.note")}
                  </span>
                </>
              ) : (
                compliance.dispatchEstimate[locale]
              )}
            </dd>
          </div>
          <div>
            <dt>{t(locale, "regions")}</dt>
            <dd>{compliance.deliveryRegions.map((country) => t(locale, `country.${country}`)).join(", ")}</dd>
          </div>
          <div>
            <dt>{t(locale, "maker")}</dt>
            <dd>{compliance.manufacturer}</dd>
          </div>
          <div>
            <dt>{t(locale, "responsible")}</dt>
            <dd>{compliance.euResponsiblePerson}</dd>
          </div>
          <div>
            <dt>{t(locale, "safety")}</dt>
            <dd>
              {hasSafety ? (
                <ul className="plain">
                  {compliance.safetyInfo ? <li>{compliance.safetyInfo[locale]}</li> : null}
                  {compliance.warnings.map((warning) => (
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
              {compliance.returnExceptions.length > 0 ? (
                <ul className="plain">
                  {compliance.returnExceptions.map((note) => (
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
