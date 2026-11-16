import { articleBySlug, articles } from "@kummie/core";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArticleView } from "@/components/ArticleView";
import { localeParam } from "@/lib/paths";

type Props = { params: Promise<{ locale: string; slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return articles.filter((article) => article.section === "teen").map((article) => ({ slug: article.slug }));
}

/** No author, byline or other metadata about the young contributor. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const article = articleBySlug(slug);
  return article ? { title: article.title[localeParam(locale)] } : {};
}

export default async function TeenArticlePage({ params }: Props) {
  const { locale, slug } = await params;
  const article = articleBySlug(slug);
  if (!article || article.section !== "teen") notFound();
  return <ArticleView article={article} locale={localeParam(locale)} />;
}
