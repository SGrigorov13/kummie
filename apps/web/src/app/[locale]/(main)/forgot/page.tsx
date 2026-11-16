import { t } from "@kummie/i18n";
import type { Metadata } from "next";
import { ForgotView } from "@/components/AuthViews";
import { localeParam } from "@/lib/paths";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: t(localeParam((await params).locale), "auth.forgot"), robots: { index: false } };
}

export default async function ForgotPage({ params }: Props) {
  const locale = localeParam((await params).locale);
  return (
    <div className="wrap section narrow">
      <h1>{t(locale, "auth.forgot")}</h1>
      <ForgotView />
    </div>
  );
}
