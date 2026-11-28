import { ApiRequestError, type Shortage } from "@kummie/contracts";
import { formatMoney } from "@kummie/core";
import { useEffect, useState } from "react";
import { api, useAdmin } from "./context";

/**
 * Пункт България → Липси (D-063 B5, D-064): units that did not arrive or came damaged. The
 * supplier has 3 working days; then an admin confirms the partial refund with one button.
 */
export function Shortages() {
  const { t, locale, staff } = useAdmin();
  const [items, setItems] = useState<Shortage[] | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    api.shortages().then((r) => setItems(r.items));
  }, []);

  if (!items) return <p>{t("admin.loading")}</p>;
  const date = (iso: string) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString(locale === "bg" ? "bg-BG" : "en-GB");
  const money = (cents: number) => formatMoney(cents, locale);

  async function act(id: string, run: () => Promise<{ items: Shortage[] }>) {
    setBusy(id);
    setMessage(null);
    try {
      setItems((await run()).items);
      setMessage({ kind: "ok", text: t("admin.saved") });
    } catch (e) {
      const text = e instanceof ApiRequestError ? (e.body?.message ?? e.message) : String(e);
      setMessage({ kind: "error", text: t("admin.hub.refundFailed", { message: text }) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="panel stack">
      <p className="note">{t("admin.hub.shortagesLead")}</p>
      {message ? (
        <p className={message.kind === "ok" ? "ok" : "error"} role="status">
          {message.text}
        </p>
      ) : null}
      {items.length === 0 ? <p>{t("admin.hub.shortagesEmpty")}</p> : null}
      <ul className="checklist">
        {items.map((s) => (
          <li key={s.id} className="stack">
            <div>
              <strong>
                {t(`admin.hub.shortage.${s.kind}`)}: {s.title} ({s.version}) × {s.qty}
              </strong>{" "}
              · {s.orderNumber} · {s.supplierName}
              {s.poReference ? ` · ${s.poReference}` : ""} · {t(`admin.hub.shortage.${s.status}`)}
            </div>
            {s.status === "open" ? (
              <>
                <p className={s.due ? "error" : "note"}>
                  {s.due
                    ? t("admin.hub.shortageOverdue", { date: date(s.dueOn) })
                    : t("admin.hub.shortageDue", { date: date(s.dueOn) })}
                  {s.claimSentAt ? ` · ${t("admin.hub.claimSent")}` : ""}
                </p>
                {s.note ? <p className="note">{s.note}</p> : null}
                <div className="row">
                  {s.photoId ? (
                    <a href={api.damagePhotoUrl(s.photoId)} target="_blank" rel="noreferrer">
                      {t("admin.hub.viewPhoto")}
                    </a>
                  ) : null}
                  {s.claimSentAt ? null : (
                    <button
                      type="button"
                      className="btn btn--secondary"
                      disabled={busy === s.id}
                      onClick={() => act(s.id, () => api.shortageClaimSent(s.id))}
                    >
                      {t("admin.hub.markClaim")}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn--secondary"
                    disabled={busy === s.id}
                    onClick={() => act(s.id, () => api.shortageArrived(s.id))}
                  >
                    {t("admin.hub.markArrived")}
                  </button>
                  {staff.role === "admin" ? (
                    <button
                      type="button"
                      className={s.due ? "btn" : "btn btn--secondary"}
                      disabled={busy === s.id}
                      onClick={() => {
                        if (window.confirm(t("admin.hub.refundConfirm", { amount: money(s.refundCents) })))
                          void act(s.id, () => api.refundShortage(s.id));
                      }}
                    >
                      {t("admin.hub.refund", { amount: money(s.refundCents) })}
                    </button>
                  ) : null}
                </div>
              </>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
