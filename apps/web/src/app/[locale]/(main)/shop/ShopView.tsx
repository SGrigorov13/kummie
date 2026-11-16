"use client";

import {
  CATEGORIES,
  categoryOf,
  GENERATIONS,
  groupById,
  isCategoryId,
  isSubcategoryId,
  products,
  subcategoryById,
} from "@kummie/core";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { ProductCard } from "@/components/ProductCard";
import { useLocale, useT } from "@/lib/locale";

/** Shop filters: taxonomy category → subcategory, group generation, limited, free-text search. */
export function ShopView() {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const q = (params.get("q") ?? "").trim().toLowerCase();
  const catParam = params.get("cat") ?? "";
  const cat = isCategoryId(catParam) ? catParam : undefined;
  const subParam = params.get("sub") ?? "";
  const sub = isSubcategoryId(subParam) && cat && categoryOf(subParam).id === cat ? subParam : undefined;
  const genParam = Number(params.get("gen"));
  const gen = (GENERATIONS as readonly number[]).includes(genParam) ? genParam : undefined;
  const limitedOnly = params.get("limited") === "1";

  const list = useMemo(
    () =>
      products.filter((product) => {
        if (cat && categoryOf(product.subcategory).id !== cat) return false;
        if (sub && product.subcategory !== sub) return false;
        if (limitedOnly && !product.isLimited) return false;
        const group = groupById(product.groupId);
        if (gen && group?.generation !== gen) return false;
        if (!q) return true;
        const haystack = [
          product.title,
          product.summary[locale],
          group?.name ?? "",
          group?.aka ?? "",
          subcategoryById(product.subcategory)[locale],
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      }),
    [cat, gen, limitedOnly, locale, q, sub],
  );

  function setParam(changes: Record<string, string | undefined>) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  const subcategories = cat ? (CATEGORIES.find((category) => category.id === cat)?.subcategories ?? []) : [];

  return (
    <>
      <div className="filters" role="group" aria-label={t("category")}>
        <button
          type="button"
          className="chip"
          aria-pressed={!cat}
          onClick={() => setParam({ cat: undefined, sub: undefined })}
        >
          {t("all")}
        </button>
        {CATEGORIES.map((category) => (
          <button
            key={category.id}
            type="button"
            className="chip"
            aria-pressed={cat === category.id}
            onClick={() => setParam({ cat: category.id, sub: undefined })}
          >
            {category[locale]}
          </button>
        ))}
      </div>
      <div className="filters filters--selects">
        {cat ? (
          <label className="select">
            <span>{t("subcategory")}</span>
            <select
              value={sub ?? ""}
              onChange={(event) => setParam({ sub: event.target.value || undefined })}
            >
              <option value="">{t("all")}</option>
              {subcategories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item[locale]}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="select">
          <span>{t("gen")}</span>
          <select value={gen ?? ""} onChange={(event) => setParam({ gen: event.target.value || undefined })}>
            <option value="">{t("all")}</option>
            {GENERATIONS.map((generation) => (
              <option key={generation} value={generation}>
                {t("genN", { n: generation })}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={limitedOnly}
            onChange={(event) => setParam({ limited: event.target.checked ? "1" : undefined })}
          />
          {t("limited")}
        </label>
      </div>
      <p className="muted" role="status">
        {t("results", { count: list.length })}
      </p>
      {list.length === 0 ? (
        <p>{t("none")}</p>
      ) : (
        <div className="grid">
          {list.map((product) => (
            <ProductCard key={product.id} product={product} locale={locale} />
          ))}
        </div>
      )}
    </>
  );
}
