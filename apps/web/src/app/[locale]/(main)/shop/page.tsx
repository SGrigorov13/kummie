import { GENERATIONS } from "@kummie/core";
import { t } from "@kummie/i18n";
import type { Metadata } from "next";
import Link from "next/link";
import { ProductCard } from "@/components/ProductCard";
import { catalogue, tryCatalogue } from "@/lib/catalogue-server";
import { href, localeParam } from "@/lib/paths";
import { ShopFilters } from "./ShopView";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const PAGE_SIZE = 24;
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: t(localeParam((await params).locale), "shop") };
}

/**
 * The shop: published products from the API, filtered by category → subcategory, generation,
 * limited and search — all in the URL, so a filtered list can be shared and the back button works.
 */
export default async function ShopPage({ params, searchParams }: Props) {
  const locale = localeParam((await params).locale);
  const query = await searchParams;
  const cat = one(query.cat) || undefined;
  const sub = one(query.sub) || undefined;
  const genNumber = Number(one(query.gen));
  const gen = (GENERATIONS as readonly number[]).includes(genNumber) ? genNumber : undefined;
  const limited = one(query.limited) === "1";
  const q = one(query.q).trim().slice(0, 100) || undefined;
  const page = Math.max(1, Number(one(query.page)) || 1);

  const [categories, list] = await Promise.all([
    tryCatalogue(() => catalogue.listCategories()),
    tryCatalogue(() =>
      catalogue.listProducts({
        ...(cat ? { cat } : {}),
        ...(sub ? { sub } : {}),
        ...(gen ? { gen } : {}),
        ...(limited ? { limited: true } : {}),
        ...(q ? { q } : {}),
        page,
        pageSize: PAGE_SIZE,
      }),
    ),
  ]);

  const pages = list ? Math.max(1, Math.ceil(list.total / PAGE_SIZE)) : 1;
  const pageHref = (n: number) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(query))
      if (key !== "page" && one(value)) next.set(key, one(value));
    if (n > 1) next.set("page", String(n));
    const search = next.toString();
    return href(locale, `/shop${search ? `?${search}` : ""}`);
  };

  return (
    <div className="wrap section">
      <h1>{t(locale, "shop")}</h1>
      <ShopFilters categories={categories?.items ?? []} />
      {list === null ? (
        <p className="notice">{t(locale, "shop.offline")}</p>
      ) : (
        <>
          <p className="muted" role="status">
            {t(locale, "results", { count: list.total })}
          </p>
          {list.items.length === 0 ? (
            <p>{t(locale, "none")}</p>
          ) : (
            <div className="grid">
              {list.items.map((product) => (
                <ProductCard key={product.slug} product={product} locale={locale} />
              ))}
            </div>
          )}
          {pages > 1 ? (
            <nav className="row" aria-label={t(locale, "shop.pages")}>
              {page > 1 ? (
                <Link className="btn btn--secondary btn--small" href={pageHref(page - 1)}>
                  {t(locale, "shop.prev")}
                </Link>
              ) : null}
              <span className="muted">{t(locale, "shop.pageOf", { page, pages })}</span>
              {page < pages ? (
                <Link className="btn btn--secondary btn--small" href={pageHref(page + 1)}>
                  {t(locale, "shop.next")}
                </Link>
              ) : null}
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}
