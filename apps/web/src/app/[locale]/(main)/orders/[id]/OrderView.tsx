"use client";

import type { OrderDetail, OrderStatus } from "@kummie/contracts";
import { CUSTOMER_STEPS, customerStep, customerStepNumber, formatMoney, isOffTrack } from "@kummie/core";
import { useEffect, useState, type FormEvent } from "react";
import {
  EMPTY_INVOICE,
  InvoiceFields,
  toInvoiceRequest,
  type InvoiceDraft,
  type InvoiceKind,
} from "@/components/InvoiceFields";
import { codeOf, commonErrorKey } from "@/lib/account";
import { useLocale, useT } from "@/lib/locale";
import { fragmentValue, shopApi, useCart } from "@/lib/shop";

/**
 * The customer's order: the 7 steps (ARCHITECTURE §4), off-track states in plain words, lines with
 * the frozen prices and VAT. Guests open it with the key in the link (#k=…, never sent to servers).
 */
export function OrderView({ id }: { id: string }) {
  const t = useT();
  const locale = useLocale();
  const { refresh } = useCart();
  const [order, setOrder] = useState<OrderDetail | null | undefined>(undefined);
  const [key, setKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<"paid" | "cancelled" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [invoiceKind, setInvoiceKind] = useState<InvoiceKind>("person");
  const [invoiceDraft, setInvoiceDraft] = useState<InvoiceDraft>(EMPTY_INVOICE);
  const [invoiceState, setInvoiceState] = useState<"idle" | "sending" | "done">("idle");
  const [invoiceError, setInvoiceError] = useState<string | null>(null);

  useEffect(() => {
    const k = fragmentValue("k");
    const params = new URLSearchParams(window.location.search);
    shopApi.order(id, k).then(
      (o) => {
        setKey(k);
        setOrder(o);
        setNotice(
          params.has("paid") && o.status !== "pending_payment"
            ? "paid"
            : params.has("cancelled")
              ? "cancelled"
              : null,
        );
        if (params.has("paid")) void refresh();
      },
      () => setOrder(null),
    );
  }, [id, refresh]);

  if (order === undefined)
    return (
      <div className="wrap section">
        <p role="status">…</p>
      </div>
    );
  if (order === null) {
    return (
      <div className="wrap section narrow">
        <p className="notice">{t("order.notFound")}</p>
      </div>
    );
  }

  const current = customerStepNumber(order.status) ?? 0;
  const statusLabel = (status: OrderStatus) => {
    const step = customerStep(status);
    if (step) return t(`step.${step}`);
    return isOffTrack(status) ? t(`status.${status}`) : t("status.pending_payment");
  };
  const date = (iso: string) => new Date(iso).toLocaleDateString(locale === "bg" ? "bg-BG" : "en-GB");

  async function cancelOrder() {
    setCancelError(null);
    try {
      setOrder(await shopApi.cancelOrder(id, key));
      setConfirming(false);
      setNotice(null);
    } catch {
      setCancelError(t("order.cancelFailed"));
    }
  }

  /** "Поискай фактура" after the payment (D-067): issued at once and e-mailed as PDF. */
  async function requestInvoice(event: FormEvent) {
    event.preventDefault();
    setInvoiceError(null);
    setInvoiceState("sending");
    try {
      setOrder(await shopApi.requestInvoice(id, toInvoiceRequest(invoiceKind, invoiceDraft), key));
      setInvoiceState("done");
      setInvoiceOpen(false);
    } catch (e) {
      setInvoiceState("idle");
      setInvoiceError(
        codeOf(e) === "invoice_not_possible" ? t("order.invoiceTooLate") : t(commonErrorKey(e)),
      );
    }
  }

  /** PDFs come with the order key as a header (guests), so the key never ends up in a URL. */
  async function download(documentId: string, number: string) {
    try {
      const blob = await shopApi.documentPdf(id, documentId, key);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `kummie-${number}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError(t("auth.error"));
    }
  }

  async function payNow() {
    setError(null);
    try {
      const { redirectUrl } = await shopApi.payAgain(id, key);
      window.location.assign(redirectUrl);
    } catch (e) {
      setError(t(commonErrorKey(e)));
    }
  }

  return (
    <div className="wrap section">
      <p className="label">{t("order")}</p>
      <h1>{t("order.title", { number: order.number })}</h1>
      <p className="muted">{t("order.placedOn", { date: date(order.createdAt) })}</p>
      {notice === "paid" ? (
        <p className="notice" role="status">
          {t("order.paidThanks")}
        </p>
      ) : null}
      {notice === "cancelled" && order.canPay ? (
        <p className="notice" role="status">
          {t("order.paymentCancelled")}
        </p>
      ) : null}

      {order.status === "pending_payment" ? (
        <div className="row">
          <p className="notice">{t("status.pending_payment")}</p>
          <button type="button" className="btn" onClick={payNow}>
            {t("order.payNow")} · {formatMoney(order.totalCents, locale)}
          </button>
          {error ? <p role="alert">{error}</p> : null}
        </div>
      ) : isOffTrack(order.status) ? (
        <p className="notice">{t(`status.${order.status}`)}</p>
      ) : (
        <>
          <p className="label">{t("stepOf", { n: current })}</p>
          <ol className="steps">
            {CUSTOMER_STEPS.map((step, index) => {
              const done = index + 1 <= current;
              return (
                <li
                  key={step}
                  className={done ? "steps__item steps__item--done" : "steps__item"}
                  aria-current={index + 1 === current ? "step" : undefined}
                >
                  <span className="steps__n" aria-hidden="true">
                    {index + 1}
                  </span>
                  {t(`step.${step}`)}
                </li>
              );
            })}
          </ol>
        </>
      )}

      {order.canCancel ? (
        <div className="panel">
          {confirming ? (
            <>
              <p>
                {order.status === "pending_payment"
                  ? t("order.cancelUnpaid")
                  : t("order.cancelRefund", { amount: formatMoney(order.totalCents, locale) })}
                {order.kummies > 0 ? ` ${t("order.cancelKummies", { kummies: order.kummies })}` : ""}
              </p>
              <div className="row">
                <button type="button" className="btn btn--secondary" onClick={cancelOrder}>
                  {t("order.cancelYes")}
                </button>
                <button type="button" className="btn btn--secondary" onClick={() => setConfirming(false)}>
                  {t("order.cancelNo")}
                </button>
              </div>
            </>
          ) : (
            <button type="button" className="btn btn--secondary" onClick={() => setConfirming(true)}>
              {t("order.cancel")}
            </button>
          )}
          {cancelError ? <p role="alert">{cancelError}</p> : null}
        </div>
      ) : !isOffTrack(order.status) && order.status !== "delivered" && order.status !== "pending_payment" ? (
        <p className="muted">{t("order.cancelLate")}</p>
      ) : null}

      <ul className="lines">
        {order.lines.map((line) => (
          <li key={line.sku} className="line">
            <div>
              <strong>
                {line.qty} × {line.title}
              </strong>
              <p className="muted">
                {line.version} · {line.dispatchEstimate[locale]}
              </p>
              {line.refundedQty > 0 ? (
                <p className="notice">{t("order.lineRefunded", { qty: line.refundedQty })}</p>
              ) : null}
            </div>
            <span>{formatMoney(line.lineTotalCents, locale)}</span>
          </li>
        ))}
      </ul>

      <dl className="totals">
        <div>
          <dt>{t("subtotal")}</dt>
          <dd>{formatMoney(order.goodsCents, locale)}</dd>
        </div>
        <div>
          <dt>{t("shipping")}</dt>
          <dd>{order.shippingCents === 0 ? t("shippingFree") : formatMoney(order.shippingCents, locale)}</dd>
        </div>
        <div className="totals__grand">
          <dt>{t("total")}</dt>
          <dd>{formatMoney(order.totalCents, locale)}</dd>
        </div>
        <div className="totals__vat">
          <dt>{t("vatLine", { rate: Math.round(order.vatRate * 100) })}</dt>
          <dd>{formatMoney(order.vatCents, locale)}</dd>
        </div>
      </dl>
      {order.kummies > 0 ? <p>{t("order.kummies", { kummies: order.kummies })}</p> : null}

      {order.parcels.length > 0 ? (
        <>
          <h2 className="h3">{t("order.tracking")}</h2>
          <ul className="plain">
            {order.parcels.map((p) => (
              <li key={p.trackingNumber}>{t("order.trackingNumber", { number: p.trackingNumber })}</li>
            ))}
          </ul>
        </>
      ) : null}

      {order.documents.length > 0 ? (
        <>
          <h2 className="h3">{t("order.documents")}</h2>
          <ul className="plain">
            {order.documents.map((d) => (
              <li key={d.id}>
                <button type="button" className="link-button" onClick={() => download(d.id, d.number)}>
                  {t(`doc.${d.kind}`)} № {d.number}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {invoiceState === "done" ? (
        <p className="notice" role="status">
          {t("order.invoiceIssued")}
        </p>
      ) : null}
      {order.invoiceRequestUntil ? (
        <div className="panel">
          {invoiceOpen ? (
            <form className="stack" onSubmit={requestInvoice}>
              <fieldset className="fieldset">
                <legend className="h3">{t("order.invoiceRequest")}</legend>
                {(["person", "company"] as const).map((kind) => (
                  <label key={kind} className="check">
                    <input
                      type="radio"
                      name="late-invoice"
                      checked={invoiceKind === kind}
                      onChange={() => setInvoiceKind(kind)}
                    />
                    {t(kind === "person" ? "shop.invoicePerson" : "shop.invoiceCompany")}
                  </label>
                ))}
                <InvoiceFields
                  kind={invoiceKind}
                  draft={invoiceDraft}
                  onChange={setInvoiceDraft}
                  idPrefix="late-inv"
                />
              </fieldset>
              <div className="row">
                <button type="submit" className="btn" disabled={invoiceState === "sending"}>
                  {t("order.invoiceSend")}
                </button>
                <button type="button" className="btn btn--secondary" onClick={() => setInvoiceOpen(false)}>
                  {t("order.cancelNo")}
                </button>
              </div>
            </form>
          ) : (
            <>
              <p className="muted">{t("order.invoiceUntil", { date: date(order.invoiceRequestUntil) })}</p>
              <button type="button" className="btn btn--secondary" onClick={() => setInvoiceOpen(true)}>
                {t("order.invoiceRequest")}
              </button>
            </>
          )}
          {invoiceError ? <p role="alert">{invoiceError}</p> : null}
        </div>
      ) : null}

      <h2 className="h3">{t("order.deliverTo")}</h2>
      <p>
        {[
          order.address.name,
          order.address.line1,
          order.address.line2,
          `${order.address.postcode} ${order.address.city}`,
          t(`country.${order.address.country}`),
          order.address.phone,
        ]
          .filter(Boolean)
          .join(", ")}
      </p>
      {order.invoice ? (
        <>
          <h2 className="h3">{t("order.invoice")}</h2>
          <p>
            {order.invoice.name}
            {order.invoice.kind === "company" ? `, ${t("shop.eik")} ${order.invoice.eik}` : ""},{" "}
            {order.invoice.address}
          </p>
        </>
      ) : null}

      <h2 className="h3">{t("order.timeline")}</h2>
      <ul className="plain">
        {order.events.map((e, i) => (
          <li key={`${e.status}-${i}`}>
            {date(e.at)} — {statusLabel(e.status)}
          </li>
        ))}
      </ul>
    </div>
  );
}
