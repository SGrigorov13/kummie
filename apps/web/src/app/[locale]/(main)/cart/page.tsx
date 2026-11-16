import { t } from "@kummie/i18n";
import type { Metadata } from "next";
import { localeParam } from "@/lib/paths";
import { CartView } from "./CartView";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: t(localeParam((await params).locale), "cart"), robots: { index: false } };
}

export default async function CartPage({ params }: Props) {
  const locale = localeParam((await params).locale);
  return (
    <div className="wrap section">
      <h1>{t(locale, "cart")}</h1>
      <CartView />
    </div>
  );
}
