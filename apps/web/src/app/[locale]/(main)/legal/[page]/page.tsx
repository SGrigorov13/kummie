import { t } from "@kummie/i18n";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LEGAL_PAGES, type LegalPage } from "@/components/Footer";
import { localeParam } from "@/lib/paths";

type Props = { params: Promise<{ locale: string; page: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return LEGAL_PAGES.map((page) => ({ page }));
}

function legalPage(value: string): LegalPage {
  if (!(LEGAL_PAGES as readonly string[]).includes(value)) notFound();
  return value as LegalPage;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, page } = await params;
  return { title: t(localeParam(locale), legalPage(page)) };
}

export default async function LegalPageView({ params }: Props) {
  const { locale: rawLocale, page: rawPage } = await params;
  const locale = localeParam(rawLocale);
  const page = legalPage(rawPage);
  return (
    <div className="wrap section prose">
      <h1>{t(locale, page)}</h1>
      <p>{t(locale, `legal.${page}`)}</p>
    </div>
  );
}
