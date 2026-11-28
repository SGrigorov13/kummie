"use client";

import type { ComplaintDemand, OrderDetail } from "@kummie/contracts";
import { useState, type FormEvent } from "react";
import { commonErrorKey } from "@/lib/account";
import { useLocale, useT } from "@/lib/locale";
import { shopApi } from "@/lib/shop";

const DEMANDS: ComplaintDemand[] = ["repair", "replacement", "price_reduction", "refund"];

/**
 * The order's complaints and "Подай рекламация" (D-069): registered at once with a number, a copy
 * by e-mail and an answer within one month.
 */
export function ComplaintForm({
  order,
  orderKey,
  onChange,
}: {
  order: OrderDetail;
  orderKey: string | null;
  onChange: (order: OrderDetail) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [lineId, setLineId] = useState<string>("");
  const [description, setDescription] = useState("");
  const [demand, setDemand] = useState<ComplaintDemand>("replacement");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const date = (iso: string) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString(locale === "bg" ? "bg-BG" : "en-GB");

  async function send(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setState("sending");
    try {
      onChange(
        await shopApi.fileComplaint(order.id, { orderLineId: lineId || null, description, demand }, orderKey),
      );
      setState("sent");
      setOpen(false);
      setDescription("");
    } catch (e) {
      setState("idle");
      setError(t(commonErrorKey(e)));
    }
  }

  if (!order.canComplain && order.complaints.length === 0) return null;
  return (
    <>
      {order.complaints.length > 0 ? (
        <>
          <h2 className="h3">{t("order.complaints")}</h2>
          <ul className="plain">
            {order.complaints.map((c) => (
              <li key={c.number}>
                {t("order.complaintLine", {
                  number: c.number,
                  product: c.product,
                  status: t(`complaint.status.${c.status}`),
                  dueOn: date(c.dueOn),
                })}
                {c.outcome ? <p className="muted">{c.outcome}</p> : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {state === "sent" ? (
        <p className="notice" role="status">
          {t("order.complaintSent")}
        </p>
      ) : null}
      {order.canComplain ? (
        <div className="panel">
          {open ? (
            <form className="stack" onSubmit={send}>
              <p className="muted">{t("order.complaintLead")}</p>
              <label className="field">
                <span>{t("order.complaintProduct")}</span>
                <select value={lineId} onChange={(e) => setLineId(e.target.value)}>
                  <option value="">{t("order.complaintWholeOrder")}</option>
                  {order.lines.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.title} ({l.version})
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>{t("order.complaintDescription")}</span>
                <textarea
                  required
                  minLength={10}
                  maxLength={2000}
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
              <fieldset className="fieldset">
                <legend>{t("order.complaintDemand")}</legend>
                {DEMANDS.map((d) => (
                  <label key={d} className="check">
                    <input type="radio" name="demand" checked={demand === d} onChange={() => setDemand(d)} />
                    {t(`complaint.demand.${d}`)}
                  </label>
                ))}
              </fieldset>
              <div className="row">
                <button type="submit" className="btn" disabled={state === "sending"}>
                  {t("order.complaintSend")}
                </button>
                <button type="button" className="btn btn--secondary" onClick={() => setOpen(false)}>
                  {t("order.cancelNo")}
                </button>
              </div>
            </form>
          ) : (
            <button type="button" className="btn btn--secondary" onClick={() => setOpen(true)}>
              {t("order.complaint")}
            </button>
          )}
          {error ? <p role="alert">{error}</p> : null}
        </div>
      ) : null}
    </>
  );
}
