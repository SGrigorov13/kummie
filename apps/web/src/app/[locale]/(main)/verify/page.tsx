import { t } from "@kummie/i18n";
import type { Metadata } from "next";
import { VerifyView } from "@/components/AuthViews";
import { localeParam } from "@/lib/paths";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: t(localeParam((await params).locale), "auth.checkEmailTitle"), robots: { index: false } };
}

export default async function VerifyPage({ params }: Props) {
  const locale = localeParam((await params).locale);
  return (
    <div className="wrap section narrow">
      <h1>{t(locale, "auth.checkEmailTitle")}</h1>
      <VerifyView />
    </div>
  );
}
