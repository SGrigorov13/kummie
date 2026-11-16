import type { AdminClient } from "@kummie/contracts";
import { formatMoney } from "@kummie/core";
import { useEffect, useState } from "react";
import { api, useAdmin } from "./context";

type Item = Awaited<ReturnType<AdminClient["listProducts"]>>["items"][number];

/** Product list for staff: status, price and how many required fields are still missing. */
export function Catalogue({ onOpen }: { onOpen: (id: string | "new") => void }) {
  const { t, locale } = useAdmin();
  const [items, setItems] = useState<Item[] | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      api.listProducts(q.trim() || undefined).then((r) => setItems(r.items));
    }, 200);
    return () => clearTimeout(timer);
  }, [q]);

  return (
    <div className="stack">
      <div className="row">
        <input
          className="search"
          type="search"
          aria-label={t("admin.searchProducts")}
          placeholder={t("admin.searchProducts")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button type="button" className="btn" onClick={() => onOpen("new")}>
          {t("admin.newProduct")}
        </button>
      </div>
      {items === null ? (
        <p>{t("admin.loading")}</p>
      ) : items.length === 0 ? (
        <p>{t("admin.noProducts")}</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>{t("admin.colTitle")}</th>
              <th>{t("admin.colStatus")}</th>
              <th>{t("admin.colPrice")}</th>
              <th>{t("admin.colMissing")}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <button type="button" className="link-button" onClick={() => onOpen(item.id)}>
                    {item.title || item.slug}
                  </button>
                  {item.isDemo ? <span className="tag">{t("admin.demoTag")}</span> : null}
                </td>
                <td>
                  <span className={`status status--${item.status}`}>{t(`admin.status.${item.status}`)}</span>
                </td>
                <td>{item.priceCents !== null ? formatMoney(item.priceCents, locale) : "—"}</td>
                <td>{item.missingCount === 0 ? "✓" : item.missingCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** Dashboard numbers from the product list. */
export function useProductStats() {
  const [stats, setStats] = useState<{ published: number; drafts: number; blocked: number } | null>(null);
  useEffect(() => {
    api.listProducts().then(({ items }) =>
      setStats({
        published: items.filter((i) => i.status === "published").length,
        drafts: items.filter((i) => i.status === "draft").length,
        blocked: items.filter((i) => i.status === "draft" && i.missingCount > 0).length,
      }),
    );
  }, []);
  return stats;
}
