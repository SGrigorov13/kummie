import { articleBySlug, articles } from "@kummie/core";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArticleView } from "@/components/ArticleView";
import { localeParam } from "@/lib/paths";

type Props = { params: Promise<{ locale: string; slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return articles.filter((article) => article.section === "magazine").map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const article = articleBySlug(slug);
  return article ? { title: article.title[localeParam(locale)] } : {};
}

export default async function MagazineArticlePage({ params }: Props) {
  const { locale, slug } = await params;
  const article = articleBySlug(slug);
  if (!article || article.section !== "magazine") notFound();
  return <ArticleView article={article} locale={localeParam(locale)} />;
}
