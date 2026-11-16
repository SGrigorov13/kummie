"use client";

import type { Category } from "@kummie/contracts";
import { GENERATIONS } from "@kummie/core";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale, useT } from "@/lib/locale";

/**
 * Shop filters: taxonomy category → subcategory, group generation, limited. They only change the
 * URL; the server renders the matching products. Search comes from the header (`?q=`).
 */
export function ShopFilters({ categories }: { categories: Category[] }) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const cat = params.get("cat") ?? "";
  const sub = params.get("sub") ?? "";
  const gen = params.get("gen") ?? "";
  const limitedOnly = params.get("limited") === "1";
  const q = params.get("q") ?? "";

  function setParam(changes: Record<string, string | undefined>) {
    const next = new URLSearchParams(params);
    next.delete("page");
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  const subcategories = categories.find((category) => category.id === cat)?.subcategories ?? [];

  return (
    <>
      {q ? (
        <p>
          {t("shop.searchFor", { q })}{" "}
          <button type="button" className="link-button" onClick={() => setParam({ q: undefined })}>
            {t("shop.clearSearch")}
          </button>
        </p>
      ) : null}
      <div className="filters" role="group" aria-label={t("category")}>
        <button
          type="button"
          className="chip"
          aria-pressed={!cat}
          onClick={() => setParam({ cat: undefined, sub: undefined })}
        >
          {t("all")}
        </button>
        {categories.map((category) => (
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
        {cat && subcategories.length > 0 ? (
          <label className="select">
            <span>{t("subcategory")}</span>
            <select value={sub} onChange={(event) => setParam({ sub: event.target.value || undefined })}>
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
          <select value={gen} onChange={(event) => setParam({ gen: event.target.value || undefined })}>
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
    </>
  );
}
