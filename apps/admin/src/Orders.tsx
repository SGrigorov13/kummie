import {
  ApiRequestError,
  type AdminOrder,
  type AdminOrderSummary,
  type OrderStatus,
} from "@kummie/contracts";
import { formatMoney } from "@kummie/core";
import type { MessageKey } from "@kummie/i18n";
import { useEffect, useState, type FormEvent } from "react";
import { api, useAdmin } from "./context";
import { canIssueInvoice, IssueInvoice } from "./IssueInvoice";

const STATUSES: OrderStatus[] = [
  "pending_payment",
  "paid",
  "batched",
  "ordered_from_supplier",
  "supplier_shipped",
  "received_at_hub",
  "packed",
  "handed_to_carrier",
  "out_for_delivery",
  "delivered",
  "cancelled",
  "refunded",
  "partially_refunded",
  "exception",
];

const statusKey = (s: OrderStatus) => `admin.orderStatus.${s}` as MessageKey;

/** Admin → Orders: list with status filter and search (number or e-mail). */
export function Orders({ onOpen }: { onOpen: (id: string) => void }) {
  const { t, locale } = useAdmin();
  const [status, setStatus] = useState<OrderStatus | "">("");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<AdminOrderSummary[] | null>(null);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      api.listOrders({ status: status || undefined, q: q.trim() || undefined }).then(
        (r) => {
          setItems(r.items);
          setTotal(r.total);
        },
        () => setItems([]),
      );
    }, 200);
    return () => clearTimeout(timer);
  }, [status, q]);

  const date = (iso: string) => new Date(iso).toLocaleString(locale === "bg" ? "bg-BG" : "en-GB");

  return (
    <div className="stack">
      <div className="row">
        <input
          className="search"
          type="search"
          aria-label={t("admin.ordersSearch")}
          placeholder={t("admin.ordersSearch")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          aria-label={t("admin.colStatus")}
          value={status}
          onChange={(e) => setStatus(e.target.value as OrderStatus | "")}
        >
          <option value="">{t("admin.ordersAll")}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(statusKey(s))}
            </option>
          ))}
        </select>
        <span className="note">{total}</span>
      </div>
      {items === null ? (
        <p>{t("admin.loading")}</p>
      ) : items.length === 0 ? (
        <p>{t("admin.noOrders")}</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>{t("admin.colNumber")}</th>
              <th>{t("admin.colDate")}</th>
              <th>{t("admin.colCustomer")}</th>
              <th>{t("admin.colStatus")}</th>
              <th>{t("admin.colTotal")}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((o) => (
              <tr key={o.id}>
                <td>
                  <button type="button" className="link-button" onClick={() => onOpen(o.id)}>
                    {o.number}
                  </button>
                </td>
                <td>{date(o.createdAt)}</td>
                <td>
                  {o.name} · {o.email} · {o.country}
                  {o.guest ? <span className="tag">{t("admin.guest")}</span> : null}
                </td>
                <td>
                  <span className="status">{t(statusKey(o.status))}</span>
                </td>
                <td>{formatMoney(o.totalCents, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** One order: lines, totals, addresses, payments, refunds, full history and the status change. */
export function OrderDetailView({ id, onClose }: { id: string; onClose: () => void }) {
  const { t, locale, staff } = useAdmin();
  const [order, setOrder] = useState<AdminOrder | null>(null);
  const [to, setTo] = useState<OrderStatus | "">("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.getOrder(id).then(setOrder, () => setOrder(null));
  }, [id]);

  if (!order) return <p>{t("admin.loading")}</p>;
  const money = (cents: number) => formatMoney(cents, locale);
  const date = (iso: string) => new Date(iso).toLocaleString(locale === "bg" ? "bg-BG" : "en-GB");
  const actor = (a: string) =>
    a.startsWith("staff:") ? t("admin.actor.staff") : t(`admin.actor.${a}` as MessageKey);

  async function change(event: FormEvent) {
    event.preventDefault();
    if (!to) return;
    setBusy(true);
    setMessage(null);
    try {
      const updated = await api.changeOrderStatus(id, { to, ...(note.trim() ? { note: note.trim() } : {}) });
      setOrder(updated);
      setTo("");
      setNote("");
      setMessage({ kind: "ok", text: t("admin.order.changed") });
    } catch (e) {
      const status = e instanceof ApiRequestError ? e.status : 0;
      setMessage({
        kind: "error",
        text: t(
          status === 502
            ? "admin.order.refundFailed"
            : status === 409
              ? "admin.order.notAllowed"
              : "admin.saveFailed",
          {
            message: e instanceof Error ? e.message : String(e),
          },
        ),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <button type="button" className="link-button" onClick={onClose}>
        {t("admin.backToOrders")}
      </button>
      <section className="panel">
        <h2>
          {order.number} · <span className="status">{t(statusKey(order.status))}</span>
        </h2>
        <p className="note">
          {date(order.createdAt)} · {t("admin.order.contact")}: {order.email}
          {order.guest ? ` (${t("admin.guest")})` : ""}
        </p>
        <table className="table">
          <tbody>
            {order.lines.map((l) => (
              <tr key={l.sku}>
                <td>
                  {l.qty} × {l.title} ({l.version}) · {l.sku}
                </td>
                <td>{money(l.lineTotalCents)}</td>
              </tr>
            ))}
            <tr>
              <td>{t("admin.colTotal")}</td>
              <td>
                <strong>{money(order.totalCents)}</strong> · {Math.round(order.vatRate * 100)}%{" "}
                {money(order.vatCents)}
              </td>
            </tr>
          </tbody>
        </table>
        <p>
          {[
            order.address.name,
            order.address.line1,
            order.address.line2,
            `${order.address.postcode} ${order.address.city}`,
            order.address.country,
            order.address.phone,
          ]
            .filter(Boolean)
            .join(", ")}
        </p>
        {order.invoice ? (
          <p className="note">
            {order.invoice.kind === "company"
              ? `${order.invoice.name}, ЕИК ${order.invoice.eik}${order.invoice.vatNumber ? `, ${order.invoice.vatNumber}` : ""}, ${order.invoice.address}`
              : `${order.invoice.name}, ${order.invoice.address}`}
          </p>
        ) : null}
      </section>

      <section className="panel">
        <h2>{t("admin.order.change")}</h2>
        {order.next.length === 0 ? (
          <p className="note">{t("admin.order.final")}</p>
        ) : staff.role !== "admin" ? null : (
          <form className="stack" onSubmit={change}>
            <p className="note">{t("admin.order.testOnly")}</p>
            <div className="row">
              <select
                aria-label={t("admin.order.change")}
                value={to}
                onChange={(e) => setTo(e.target.value as OrderStatus | "")}
              >
                <option value="">—</option>
                {order.next.map((s) => (
                  <option key={s} value={s}>
                    {t(statusKey(s))}
                  </option>
                ))}
              </select>
              <input
                aria-label={t("admin.order.note")}
                placeholder={t("admin.order.note")}
                maxLength={500}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <button type="submit" className="btn" disabled={!to || busy}>
                {t("admin.order.apply")}
              </button>
            </div>
            {to === "cancelled" && order.status !== "pending_payment" ? (
              <p className="note">{t("admin.order.cancelWarn")}</p>
            ) : null}
          </form>
        )}
        {message ? (
          <p className="note" role={message.kind === "error" ? "alert" : "status"}>
            {message.text}
          </p>
        ) : null}
      </section>

      <section className="panel">
        <h2>{t("admin.order.history")}</h2>
        <table className="table">
          <tbody>
            {order.history.map((e, i) => (
              <tr key={`${e.at}-${i}`}>
                <td>{date(e.at)}</td>
                <td>
                  {e.toStatus ? t(statusKey(e.toStatus)) : e.type}
                  {e.note ? ` — ${e.note}` : ""}
                </td>
                <td>{actor(e.actor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {order.documents.length > 0 ? (
          <>
            <h2>{t("admin.order.documents")}</h2>
            <ul>
              {order.documents.map((d) => (
                <li key={d.id}>
                  <a href={api.documentUrl(order.id, d.id)}>
                    {t(`doc.${d.kind}`)} № {d.number}
                  </a>{" "}
                  · {date(d.issuedAt)}
                </li>
              ))}
            </ul>
          </>
        ) : null}
        {staff.role === "admin" && canIssueInvoice(order) ? (
          <IssueInvoice order={order} onIssued={setOrder} />
        ) : null}
        <h2>{t("admin.order.payments")}</h2>
        <ul>
          {order.payments.map((p, i) => (
            <li key={i}>
              {date(p.createdAt)} · {p.provider} · {p.status} · {money(p.amountCents)}
            </li>
          ))}
        </ul>
        {order.refunds.length > 0 ? (
          <>
            <h2>{t("admin.order.refunds")}</h2>
            <ul>
              {order.refunds.map((r, i) => (
                <li key={i}>
                  {date(r.createdAt)} · {r.reason} · {r.status} · {money(r.amountCents)}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>
    </div>
  );
}
