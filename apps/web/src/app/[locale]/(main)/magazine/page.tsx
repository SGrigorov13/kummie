import { articles } from "@kummie/core";
import { t } from "@kummie/i18n";
import type { Metadata } from "next";
import Link from "next/link";
import { href, localeParam } from "@/lib/paths";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: t(localeParam((await params).locale), "magazine") };
}

export default async function MagazinePage({ params }: Props) {
  const locale = localeParam((await params).locale);
  const list = articles.filter((article) => article.section === "magazine");
  return (
    <div className="wrap section">
      <h1>{t(locale, "magazine")}</h1>
      <p className="muted">{t(locale, "magazineLead")}</p>
      <div className="list">
        {list.map((article) => (
          <Link key={article.slug} href={href(locale, `/magazine/${article.slug}`)} className="list-row">
            <strong>{article.title[locale]}</strong>
            <span>{article.dek[locale]}</span>
          </Link>
        ))}
      </div>
      <p>
        <Link href={href(locale, "/calendar")}>{t(locale, "calendar")}</Link>
      </p>
    </div>
  );
}
