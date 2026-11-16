import { t } from "@kummie/i18n";
import type { Metadata } from "next";
import { Suspense } from "react";
import { localeParam } from "@/lib/paths";
import { ShopView } from "./ShopView";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: t(localeParam((await params).locale), "shop") };
}

export default async function ShopPage({ params }: Props) {
  const locale = localeParam((await params).locale);
  return (
    <div className="wrap section">
      <h1>{t(locale, "shop")}</h1>
      {/* Filters live in the URL (useSearchParams), which needs a Suspense boundary on a static page. */}
      <Suspense fallback={null}>
        <ShopView />
      </Suspense>
    </div>
  );
}
