import { ApiRequestError, type AdminReturn } from "@kummie/contracts";
import { formatMoney } from "@kummie/core";
import { useEffect, useState } from "react";
import { api, useAdmin } from "./context";

type Draft = {
  decision: "accepted" | "refused" | "";
  refuseReason: string;
  disposition: "to_supplier" | "keep" | "";
};

/**
 * Пункт България → Връщания (D-070): withdrawals on their way, checked line by line when the
 * parcel arrives; an admin confirms the refund ("Прието, върни парите").
 */
export function Returns() {
  const { t, locale, staff } = useAdmin();
  const [items, setItems] = useState<AdminReturn[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    api.returns().then((r) => setItems(r.items));
  }, []);

  if (!items) return <p>{t("admin.loading")}</p>;
  const date = (iso: string) =>
    new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString(
      locale === "bg" ? "bg-BG" : "en-GB",
    );
  const money = (cents: number) => formatMoney(cents, locale);
  const draftOf = (line: AdminReturn["lines"][number]): Draft =>
    drafts[line.id] ?? {
      decision: line.decision === "pending" ? "" : line.decision,
      refuseReason: line.refuseReason ?? "",
      disposition: line.disposition ?? "",
    };

  async function act(id: string, run: () => Promise<{ items: AdminReturn[] }>) {
    setBusy(id);
    setMessage(null);
    try {
      setItems((await run()).items);
      setMessage({ kind: "ok", text: t("admin.saved") });
    } catch (e) {
      const text = e instanceof ApiRequestError ? (e.body?.message ?? e.message) : String(e);
      setMessage({ kind: "error", text: t("admin.saveFailed", { message: text }) });
    } finally {
      setBusy(null);
    }
  }

  function saveDecision(r: AdminReturn) {
    const lines = r.lines
      .map((l) => ({ l, d: draftOf(l) }))
      .filter(({ d }) => d.decision !== "")
      .map(({ l, d }) => ({
        id: l.id,
        decision: d.decision as "accepted" | "refused",
        refuseReason: d.decision === "refused" ? d.refuseReason.trim() || null : null,
        disposition: d.disposition || null,
      }));
    if (lines.length === 0) return;
    void act(r.id, () => api.decideReturn(r.id, { lines }));
  }

  return (
    <section className="panel stack">
      <p className="note">{t("admin.hub.returnsLead")}</p>
      {message ? (
        <p className={message.kind === "ok" ? "ok" : "error"} role="status">
          {message.text}
        </p>
      ) : null}
      {items.length === 0 ? <p>{t("admin.hub.returnsEmpty")}</p> : null}
      <ul className="checklist">
        {items.map((r) => {
          const open = r.status === "requested" || r.status === "received";
          const allDecided = r.lines.every((l) => l.decision !== "pending");
          const anyAccepted = r.lines.some((l) => l.decision === "accepted");
          return (
            <li key={r.id} className="stack">
              <div>
                <strong>
                  {r.number} · {r.orderNumber}
                </strong>{" "}
                · {r.name} ({r.email}) · {t(`courier.${r.courier}`)} · {t(`return.status.${r.status}`)}
              </div>
              {open ? (
                <p className={r.overdue ? "error" : "note"}>
                  {t(r.overdue ? "admin.hub.returnOverdue" : "admin.hub.returnDue", {
                    date: date(r.refundDueOn),
                  })}
                </p>
              ) : null}
              {r.reason ? <p className="note">{r.reason}</p> : null}
              <table className="table">
                <tbody>
                  {r.lines.map((l) => {
                    const d = draftOf(l);
                    const set = (patch: Partial<Draft>) =>
                      setDrafts({ ...drafts, [l.id]: { ...d, ...patch } });
                    return (
                      <tr key={l.id}>
                        <td>
                          {l.qty} × {l.title} ({l.version}) · {l.sku} · {money(l.unitPriceCents * l.qty)}
                        </td>
                        <td>
                          {r.status === "received" ? (
                            <div className="stack">
                              <div className="row">
                                {(["accepted", "refused"] as const).map((v) => (
                                  <label key={v}>
                                    <input
                                      type="radio"
                                      name={`decision-${l.id}`}
                                      checked={d.decision === v}
                                      onChange={() => set({ decision: v })}
                                    />{" "}
                                    {t(
                                      v === "accepted" ? "admin.hub.returnAccept" : "admin.hub.returnRefuse",
                                    )}
                                  </label>
                                ))}
                              </div>
                              {d.decision === "refused" ? (
                                <input
                                  aria-label={t("admin.hub.returnRefuseReason")}
                                  placeholder={t("admin.hub.returnRefuseReason")}
                                  value={d.refuseReason}
                                  onChange={(e) => set({ refuseReason: e.target.value })}
                                />
                              ) : null}
                              <label>
                                {t("admin.hub.returnDisposition")}{" "}
                                <select
                                  value={d.disposition}
                                  onChange={(e) =>
                                    set({ disposition: e.target.value as Draft["disposition"] })
                                  }
                                >
                                  <option value="">—</option>
                                  <option value="to_supplier">
                                    {t("admin.hub.returnDisposition.to_supplier")}
                                  </option>
                                  <option value="keep">{t("admin.hub.returnDisposition.keep")}</option>
                                </select>
                              </label>
                            </div>
                          ) : (
                            <>
                              {t(`return.decision.${l.decision}`)}
                              {l.refuseReason ? `: ${l.refuseReason}` : ""}
                              {l.disposition ? ` · ${t(`admin.hub.returnDisposition.${l.disposition}`)}` : ""}
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="row">
                {r.status === "requested" ? (
                  <button
                    type="button"
                    className="btn btn--secondary"
                    disabled={busy === r.id}
                    onClick={() => act(r.id, () => api.returnReceived(r.id))}
                  >
                    {t("admin.hub.returnReceived")}
                  </button>
                ) : null}
                {r.status === "received" ? (
                  <button
                    type="button"
                    className="btn btn--secondary"
                    disabled={busy === r.id}
                    onClick={() => saveDecision(r)}
                  >
                    {t("admin.hub.returnSaveDecision")}
                  </button>
                ) : null}
                {r.status === "received" && allDecided && staff.role === "admin" ? (
                  <button
                    type="button"
                    className="btn"
                    disabled={busy === r.id}
                    onClick={() => {
                      if (
                        !anyAccepted ||
                        window.confirm(t("admin.hub.returnRefundConfirm", { amount: money(r.refundCents) }))
                      )
                        void act(r.id, () => api.refundReturn(r.id));
                    }}
                  >
                    {anyAccepted
                      ? t("admin.hub.returnRefund", { amount: money(r.refundCents) })
                      : t("admin.hub.returnRejectAll")}
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
