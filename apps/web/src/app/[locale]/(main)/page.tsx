import { Equaliser, Star } from "@kummie/brand/react";
import { articles, badgeSpec, categoryById } from "@kummie/core";
import { t } from "@kummie/i18n";
import Link from "next/link";
import { PhotocardGlyph } from "@/components/Icons";
import { ProductCard } from "@/components/ProductCard";
import { catalogue, tryCatalogue } from "@/lib/catalogue-server";
import { href, localeParam } from "@/lib/paths";

/** Refreshed every minute from the catalogue (ISR). */
// Refreshed every minute (ISR): must be a literal number for Next.js.
export const revalidate = 60;

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = localeParam((await params).locale);
  // Newest published products; the list comes from the admin, not from code.
  const [latest, limitedList] = await Promise.all([
    tryCatalogue(() => catalogue.listProducts({ pageSize: 4 })),
    tryCatalogue(() => catalogue.listProducts({ limited: true, pageSize: 1 })),
  ]);
  const picks = latest?.items ?? [];
  const reads = articles.filter((article) => article.section === "magazine").slice(0, 3);
  // The pink tile is a scarcity claim, so it only appears when the data has a limited product.
  const hasLimited = (limitedList?.total ?? 0) > 0;

  return (
    <>
      <section className="hero on-violet">
        <div className="wrap hero__grid">
          <div className="hero__copy">
            <p className="eyebrow">{t(locale, "heroKicker")}</p>
            <h1 className="display">{t(locale, "heroTitle")}</h1>
            <p className="hero__body">{t(locale, "heroBody")}</p>
            <div className="row">
              <Link className="btn" href={href(locale, "/shop")}>
                {t(locale, "heroCta")}
              </Link>
              <Link className="btn btn--secondary" href={href(locale, "/magazine/what-is-a-photocard")}>
                {t(locale, "heroAlt")}
              </Link>
            </div>
          </div>
          <div className="hero__media" aria-hidden="true">
            <span className="shot__label">product shot</span>
            <Star className="hero__star" />
            <Equaliser height={48} />
          </div>
        </div>
      </section>

      <section className="wrap section" aria-labelledby="categories-title">
        <h2 id="categories-title" className="sr-only">
          {t(locale, "categoriesTitle")}
        </h2>
        <div className="tiles">
          <Link href={href(locale, "/shop?cat=albums")} className="tile tile--ink">
            <Star className="tile__glyph tile__glyph--glow" />
            <span className="tile__label">{categoryById("albums")[locale]}</span>
          </Link>
          <Link href={href(locale, "/shop?cat=concert-tour")} className="tile tile--violet">
            <Equaliser compact height={26} className="tile__glyph tile__glyph--glow" />
            <span className="tile__label">{categoryById("concert-tour")[locale]}</span>
          </Link>
          <Link href={href(locale, "/shop?cat=photocards-paper")} className="tile tile--spotlight">
            <PhotocardGlyph className="tile__glyph" />
            <span className="tile__label">{categoryById("photocards-paper")[locale]}</span>
          </Link>
          {hasLimited ? (
            <Link href={href(locale, "/shop?limited=1")} className="tile tile--pink">
              <span className="label tile__glyph">{badgeSpec("LIMITED")[locale]}</span>
              <span className="tile__label">{t(locale, "limited")}</span>
            </Link>
          ) : null}
        </div>
      </section>

      <section className="wrap section" aria-labelledby="picks-title">
        <h2 id="picks-title">{t(locale, "picks")}</h2>
        <p className="muted">{t(locale, "bundleHint")}</p>
        <div className="grid">
          {picks.map((product) => (
            <ProductCard key={product.slug} product={product} locale={locale} />
          ))}
        </div>
      </section>

      <section className="wrap section" aria-labelledby="magazine-title">
        <h2 id="magazine-title">{t(locale, "magazine")}</h2>
        <p className="muted">{t(locale, "magazineLead")}</p>
        <div className="list">
          {reads.map((article) => (
            <Link key={article.slug} href={href(locale, `/magazine/${article.slug}`)} className="list-row">
              <span className="label">{t(locale, "guide")}</span>
              <strong>{article.title[locale]}</strong>
              <span>{article.dek[locale]}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="band on-ink">
        <div className="wrap">
          <h2>{t(locale, "club")}</h2>
          <p>{t(locale, "clubLead")}</p>
          <Link className="btn" href={href(locale, "/club")}>
            {t(locale, "clubCta")}
          </Link>
        </div>
      </section>
    </>
  );
}
