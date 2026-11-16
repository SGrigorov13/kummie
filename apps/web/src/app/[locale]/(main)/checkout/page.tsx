import { t } from "@kummie/i18n";
import type { Metadata } from "next";
import { localeParam } from "@/lib/paths";
import { CheckoutView } from "./CheckoutView";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: t(localeParam((await params).locale), "shop.checkoutTitle"), robots: { index: false } };
}

export default async function CheckoutPage({ params }: Props) {
  const locale = localeParam((await params).locale);
  return (
    <div className="wrap section">
      <h1>{t(locale, "shop.checkoutTitle")}</h1>
      <CheckoutView />
    </div>
  );
}
