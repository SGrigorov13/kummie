import { articles } from "@kummie/core";
import { t } from "@kummie/i18n";
import type { Metadata } from "next";
import Link from "next/link";
import { href, localeParam } from "@/lib/paths";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `KUMMIE ${t(localeParam((await params).locale), "teen")}` };
}

/** Teen index: articles only. No comments, profiles, countdowns or pressure language. */
export default async function TeenPage({ params }: Props) {
  const locale = localeParam((await params).locale);
  const list = articles.filter((article) => article.section === "teen");
  return (
    <div className="wrap section">
      <h1>KUMMIE {t(locale, "teen")}</h1>
      <p className="lede">{t(locale, "teenNote")}</p>
      <div className="list">
        {list.map((article) => (
          <Link key={article.slug} href={href(locale, `/teen/${article.slug}`)} className="list-row">
            <strong>{article.title[locale]}</strong>
            <span>{article.dek[locale]}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
