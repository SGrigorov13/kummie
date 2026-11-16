"use client";

import Link from "next/link";
import { ProductCard } from "@/components/ProductCard";
import { useDemoStore } from "@/lib/demo-store";
import { useProductCards } from "@/lib/product-cards";
import { useLocale, useT } from "@/lib/locale";
import { href } from "@/lib/paths";

export function CollectView() {
  const t = useT();
  const locale = useLocale();
  const { state } = useDemoStore();
  const owned = useProductCards(state.owned) ?? [];
  const wished = useProductCards(state.wishlist) ?? [];
  return (
    <>
      <h2>{t("owned")}</h2>
      {owned.length === 0 ? (
        <p>{t("emptyCollect")}</p>
      ) : (
        <div className="grid">
          {owned.map((product) => (
            <ProductCard key={product.slug} product={product} locale={locale} />
          ))}
        </div>
      )}
      <h2>{t("wishlist")}</h2>
      {wished.length === 0 ? (
        <p>{t("emptyCollect")}</p>
      ) : (
        <div className="grid">
          {wished.map((product) => (
            <ProductCard key={product.slug} product={product} locale={locale} />
          ))}
        </div>
      )}
      <p>
        <Link className="btn btn--secondary" href={href(locale, "/groups")}>
          {t("groups")}
        </Link>
      </p>
    </>
  );
}
