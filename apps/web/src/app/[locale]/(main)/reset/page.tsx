import { t } from "@kummie/i18n";
import type { Metadata } from "next";
import { ResetView } from "@/components/AuthViews";
import { localeParam } from "@/lib/paths";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: t(localeParam((await params).locale), "auth.resetTitle"), robots: { index: false } };
}

export default async function ResetPage({ params }: Props) {
  const locale = localeParam((await params).locale);
  return (
    <div className="wrap section narrow">
      <h1>{t(locale, "auth.resetTitle")}</h1>
      <ResetView />
    </div>
  );
}
