import type { Article, Locale } from "@kummie/core";
import { t } from "@kummie/i18n";
import Link from "next/link";
import { href } from "@/lib/paths";

/** Long-form article on paper. Teen articles carry no author, date, comments or profile. */
export function ArticleView({ article, locale }: { article: Article; locale: Locale }) {
  const section = article.section === "teen" ? "teen" : "magazine";
  return (
    <article className="wrap section prose">
      <p className="label">
        <Link href={href(locale, `/${section}`)}>{t(locale, section)}</Link>
      </p>
      <h1>{article.title[locale]}</h1>
      <p className="lede">{article.dek[locale]}</p>
      {article.paragraphs.map((paragraph) => (
        <p key={paragraph.en}>{paragraph[locale]}</p>
      ))}
    </article>
  );
}
