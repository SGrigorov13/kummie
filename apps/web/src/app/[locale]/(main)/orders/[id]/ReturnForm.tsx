"use client";

import type { OrderDetail, ReturnCourier } from "@kummie/contracts";
import { useState, type FormEvent } from "react";
import { commonErrorKey } from "@/lib/account";
import { useLocale, useT } from "@/lib/locale";
import { shopApi } from "@/lib/shop";

const COURIERS: ReturnCourier[] = ["speedy", "econt", "boxnow"];

/**
 * "Откажи се" within 14 days of delivery and the order's withdrawals (D-070): the customer picks
 * the units and the courier; the e-mail has the return number and the address to send to.
 */
export function ReturnForm({
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
  const [qty, setQty] = useState<Record<string, number>>({});
  const [courier, setCourier] = useState<ReturnCourier>("speedy");
  const [reason, setReason] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const date = (iso: string) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString(locale === "bg" ? "bg-BG" : "en-GB");

  async function send(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const lines = Object.entries(qty)
      .filter(([, n]) => n > 0)
      .map(([orderLineId, n]) => ({ orderLineId, qty: n }));
    if (lines.length === 0) {
      setError(t("order.withdrawNothing"));
      return;
    }
    setState("sending");
    try {
      onChange(
        await shopApi.requestReturn(order.id, { courier, lines, reason: reason.trim() || null }, orderKey),
      );
      setState("sent");
      setOpen(false);
      setQty({});
    } catch (e) {
      setState("idle");
      setError(t(commonErrorKey(e)));
    }
  }

  if (!order.withdrawal && order.returns.length === 0) return null;
  return (
    <>
      {order.returns.length > 0 ? (
        <>
          <h2 className="h3">{t("order.returns")}</h2>
          <ul className="plain">
            {order.returns.map((r) => (
              <li key={r.number}>
                {t("order.returnLine", {
                  number: r.number,
                  status: t(`return.status.${r.status}`),
                  date: date(r.refundDueOn),
                })}
                <ul>
                  {r.lines.map((l, i) => (
                    <li key={i} className="muted">
                      {l.qty} × {l.title} ({l.version}) — {t(`return.decision.${l.decision}`)}
                      {l.refuseReason ? `: ${l.refuseReason}` : ""}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {state === "sent" ? (
        <p className="notice" role="status">
          {t("order.withdrawSent")}
        </p>
      ) : null}
      {order.withdrawal ? (
        <div className="panel">
          {open ? (
            <form className="stack" onSubmit={send}>
              <p className="muted">{t("order.withdrawLead", { date: date(order.withdrawal.until) })}</p>
              {order.withdrawal.lines.map((l) => (
                <label key={l.orderLineId} className="field">
                  <span>
                    {l.title} ({l.version}) — {t("order.withdrawQty")}
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={l.returnableQty}
                    value={qty[l.orderLineId] ?? 0}
                    onChange={(e) =>
                      setQty({
                        ...qty,
                        [l.orderLineId]: Math.min(l.returnableQty, Math.max(0, Number(e.target.value) || 0)),
                      })
                    }
                  />
                </label>
              ))}
              <fieldset className="fieldset">
                <legend>{t("order.withdrawCourier")}</legend>
                {COURIERS.map((c) => (
                  <label key={c} className="check">
                    <input
                      type="radio"
                      name="courier"
                      checked={courier === c}
                      onChange={() => setCourier(c)}
                    />
                    {t(`courier.${c}`)}
                  </label>
                ))}
              </fieldset>
              <label className="field">
                <span>{t("order.withdrawReason")}</span>
                <textarea
                  rows={2}
                  maxLength={1000}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <div className="row">
                <button type="submit" className="btn" disabled={state === "sending"}>
                  {t("order.withdrawSend")}
                </button>
                <button type="button" className="btn btn--secondary" onClick={() => setOpen(false)}>
                  {t("order.cancelNo")}
                </button>
              </div>
            </form>
          ) : (
            <button type="button" className="btn btn--secondary" onClick={() => setOpen(true)}>
              {t("order.withdraw")}
            </button>
          )}
          {error ? <p role="alert">{error}</p> : null}
        </div>
      ) : null}
    </>
  );
}
