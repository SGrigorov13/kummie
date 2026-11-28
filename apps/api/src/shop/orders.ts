import type { InvoiceRequest, OrderDetail } from "@kummie/contracts";
import {
  businessDay,
  customerCanCancel,
  formatDocNumber,
  formatMoney,
  invoiceRequestUntil,
  kummiesValidUntil,
  splitCents,
} from "@kummie/core";
import { t } from "@kummie/i18n";
import { asc, eq } from "drizzle-orm";
import type { PaymentEvent, PaymentProvider } from "../adapters/payment";
import type { FakePaymentProvider } from "../adapters/fake-payment";
import type { AccountDeps } from "../accounts/context";
import type { Database } from "../db/client";
import {
  kummiesLedger,
  orderEvents,
  orderLines,
  orders,
  parcels,
  payments,
  salesDocuments,
} from "../db/schema";
import { enqueue } from "../jobs/outbox";
import { loadCompanySettings } from "../admin/settings-routes";
import { canComplain, orderComplaints } from "../complaints/service";
import { orderReturns, withdrawalInfo } from "../returns/view";
import { issueLateInvoice, issueSaleDocuments } from "../documents/issue";
import { orderNumber, type OrderRow, type Tx } from "./basics";
import { clearBought } from "./cart-store";

export { orderNumber, type OrderRow, type Tx } from "./basics";

export type ShopDeps = AccountDeps & {
  payments: PaymentProvider;
  /** Present when PAYMENT_PROVIDER=fake: serves the hosted "pay / fail" test page. */
  fakePayments?: FakePaymentProvider;
};

/** Where the provider sends the browser back. Guests carry their key in the fragment. */
function orderUrls(deps: ShopDeps, order: OrderRow, key: string | null) {
  const base = `${deps.webUrl.replace(/\/$/, "")}/${order.locale}/orders/${order.id}`;
  const fragment = key ? `#k=${key}` : "";
  return { returnUrl: `${base}?paid=1${fragment}`, cancelUrl: `${base}?cancelled=1${fragment}` };
}

/** Opens a payment session at the provider for a pending order and records the attempt. */
export async function startPayment(deps: ShopDeps, order: OrderRow, key: string | null): Promise<string> {
  const attempt = (
    await deps.db.select({ id: payments.id }).from(payments).where(eq(payments.orderId, order.id))
  ).length;
  const session = await deps.payments.createSession({
    orderId: order.id,
    amount: { amountCents: order.totalCents, currency: "EUR" },
    methods: ["card", "apple_pay", "google_pay"],
    customerEmail: order.email,
    locale: order.locale,
    ...orderUrls(deps, order, key),
    idempotencyKey: `${order.id}:${attempt + 1}`,
  });
  await deps.db
    .insert(payments)
    .values({
      orderId: order.id,
      provider: deps.payments.name,
      sessionId: session.sessionId,
      amountCents: order.totalCents,
    })
    .onConflictDoNothing();
  return session.redirectUrl;
}

/** VAT shares per line and for delivery, adding up exactly to the order VAT (D-016). */
export function vatShares(lineTotals: number[], shippingCents: number, vatCents: number) {
  const shares = splitCents(vatCents, [...lineTotals, shippingCents]);
  return { lines: shares.slice(0, lineTotals.length), shipping: shares[lineTotals.length] ?? 0 };
}

export async function transition(
  tx: Tx,
  order: OrderRow,
  to: OrderRow["status"],
  actor: string,
  type: string,
  data: Record<string, unknown> = {},
) {
  await tx
    .update(orders)
    .set({ status: to, updatedAt: new Date(), ...(to === "paid" ? { paidAt: new Date() } : {}) })
    .where(eq(orders.id, order.id));
  await tx
    .insert(orderEvents)
    .values({ orderId: order.id, type, fromStatus: order.status, toStatus: to, actor, data });
}

/** Link to the order page; guests carry their key in the fragment (never sent to servers). */
export function orderLink(deps: Pick<ShopDeps, "webUrl">, order: OrderRow): string {
  const base = `${deps.webUrl.replace(/\/$/, "")}/${order.locale}/orders/${order.id}`;
  return !order.customerId && order.accessKey ? `${base}#k=${order.accessKey}` : base;
}

function paidEmail(deps: ShopDeps, order: OrderRow, dispatch: string, key: string, documentIds: string[]) {
  const locale = order.locale;
  const site = `${deps.webUrl.replace(/\/$/, "")}/${locale}`;
  const text = [
    t(locale, "email.orderPaid.body", {
      name: order.address.name,
      number: orderNumber(order.seq),
      total: formatMoney(order.totalCents, locale),
      vatRate: order.vatRateBp / 100,
      vat: formatMoney(order.vatCents, locale),
      shipping:
        order.shippingCents === 0 ? t(locale, "shippingFree") : formatMoney(order.shippingCents, locale),
      dispatch,
      // Guests open the order with their key; accounts simply sign in.
      link: orderLink(deps, order),
      withdrawal: `${site}/legal/withdrawal`,
    }),
    "",
    t(locale, "email.signoff", { site }),
  ].join("\n");
  return {
    to: order.email,
    subject: t(locale, "email.orderPaid.subject", { number: orderNumber(order.seq) }),
    text,
    locale,
    category: "transactional",
    idempotencyKey: key,
    cta: { label: t(locale, "email.cta.order"), url: orderLink(deps, order) },
    documentIds,
  };
}

/**
 * Applies a verified provider event. Idempotent: a repeated "authorized" for a paid order does
 * nothing. Payment moves the order to `paid`, earns Kummies (accounts only, D-027/D-031), empties
 * the bought items from the cart and queues the confirmation e-mail.
 */
export async function processPaymentEvent(
  deps: ShopDeps,
  event: PaymentEvent,
): Promise<"applied" | "ignored"> {
  const { db } = deps;
  if (event.type !== "payment.authorized" && event.type !== "payment.failed") return "ignored";
  const [payment] = await db.select().from(payments).where(eq(payments.sessionId, event.sessionId));
  if (!payment) return "ignored";

  if (event.type === "payment.failed") {
    if (payment.status !== "pending") return "ignored";
    await db.transaction(async (tx) => {
      await tx
        .update(payments)
        .set({ status: "failed", failureReason: event.reason.slice(0, 200), updatedAt: new Date() })
        .where(eq(payments.id, payment.id));
      await tx.insert(orderEvents).values({
        orderId: payment.orderId,
        type: "payment_failed",
        actor: "provider",
        data: { reason: event.reason.slice(0, 200) },
      });
    });
    return "applied";
  }

  if (event.amount.amountCents !== payment.amountCents)
    throw new Error("authorised amount differs from the order");
  const [order] = await db.select().from(orders).where(eq(orders.id, payment.orderId));
  if (!order || order.status !== "pending_payment") return "ignored";
  const company = await loadCompanySettings(db);
  // Capture right away: pre-orders take weeks and card authorisations expire after days.
  await deps.payments.capture(event.paymentId);

  const applied = await db.transaction(async (tx) => {
    const [locked] = await tx.select().from(orders).where(eq(orders.id, order.id)).for("update");
    if (!locked || locked.status !== "pending_payment") return false;
    await tx
      .update(payments)
      .set({
        status: "captured",
        providerPaymentId: event.paymentId,
        authCode: event.card?.authCode ?? null,
        terminalId: event.card?.terminalId ?? null,
        transactionRef: event.card?.transactionRef ?? null,
        updatedAt: new Date(),
      })
      .where(eq(payments.id, payment.id));
    await transition(tx, locked, "paid", "provider", "paid", { paymentId: payment.id });
    // Н-18 чл. 52о: the sales document is issued when the payment is confirmed (and an invoice on request).
    const documents = await issueSaleDocuments(
      tx,
      locked,
      {
        terminalId: event.card?.terminalId ?? null,
        authCode: event.card?.authCode ?? null,
        transactionRef: event.card?.transactionRef ?? null,
      },
      company,
    );
    const lines = await tx.select().from(orderLines).where(eq(orderLines.orderId, locked.id));
    if (locked.customerId && locked.kummies > 0) {
      const earnedOn = businessDay(new Date());
      await tx
        .insert(kummiesLedger)
        .values({
          customerId: locked.customerId,
          orderId: locked.id,
          kind: "earn",
          amount: locked.kummies,
          earnedOn,
          validUntil: kummiesValidUntil(earnedOn),
        })
        .onConflictDoNothing();
    }
    if (locked.cartId) {
      await clearBought(
        tx,
        locked.cartId,
        lines.map((l) => l.variantId).filter((id): id is string => !!id),
      );
    }
    const dispatch = [...new Set(lines.map((l) => l.dispatchEstimate[locked.locale]).filter(Boolean))].join(
      "; ",
    );
    const key = `order-paid:${locked.id}`;
    await enqueue(
      tx,
      "email",
      paidEmail(
        deps,
        locked,
        dispatch,
        key,
        documents.map((d) => d.id),
      ) as unknown as Record<string, unknown>,
      key,
    );
    return true;
  });
  if (applied) deps.kick?.();
  return applied ? "applied" : "ignored";
}

/**
 * Last day the customer may still ask for an invoice (D-067): the order is paid (its чл. 52о
 * document exists), has no invoice, was not refunded, and the window after payment is still open.
 */
export function invoiceWindow(
  order: OrderRow,
  documentKinds: readonly string[],
  requestDays: number,
  now = new Date(),
): string | null {
  if (!order.paidAt || order.status === "refunded" || order.status === "cancelled") return null;
  if (!documentKinds.includes("receipt")) return null;
  if (documentKinds.includes("invoice") || documentKinds.includes("receipt_storno")) return null;
  const until = invoiceRequestUntil(businessDay(order.paidAt), requestDays);
  return businessDay(now) <= until ? until : null;
}

/** Issues the late invoice and e-mails it to the customer, in one transaction. */
export async function requestLateInvoice(
  deps: Pick<ShopDeps, "db" | "webUrl">,
  order: OrderRow,
  request: InvoiceRequest,
): Promise<void> {
  const company = await loadCompanySettings(deps.db);
  await deps.db.transaction(async (tx) => {
    const [locked] = await tx.select().from(orders).where(eq(orders.id, order.id)).for("update");
    if (!locked) throw new Error("order vanished");
    const invoice = await issueLateInvoice(tx, locked, request, company);
    const number = orderNumber(locked.seq);
    const site = `${deps.webUrl.replace(/\/$/, "")}/${locked.locale}`;
    const key = `order-invoice:${locked.id}`;
    await enqueue(
      tx,
      "email",
      {
        to: locked.email,
        subject: t(locked.locale, "email.invoice.subject", { number }),
        text: [
          t(locked.locale, "email.invoice.body", {
            name: request.name,
            number,
            invoice: formatDocNumber(invoice.number),
          }),
          "",
          t(locked.locale, "email.signoff", { site }),
        ].join("\n"),
        locale: locked.locale,
        category: "transactional",
        idempotencyKey: key,
        cta: { label: t(locked.locale, "email.cta.order"), url: orderLink(deps, locked) },
        documentIds: [invoice.id],
      },
      key,
    );
  });
}

/** The order as the customer sees it. */
export async function orderDetail(db: Database, order: OrderRow): Promise<OrderDetail> {
  const [lines, events, documents, parcelRows] = await Promise.all([
    db.select().from(orderLines).where(eq(orderLines.orderId, order.id)).orderBy(asc(orderLines.position)),
    db.select().from(orderEvents).where(eq(orderEvents.orderId, order.id)).orderBy(asc(orderEvents.at)),
    db
      .select()
      .from(salesDocuments)
      .where(eq(salesDocuments.orderId, order.id))
      .orderBy(asc(salesDocuments.issuedAt), asc(salesDocuments.number)),
    db
      .select({ carrier: parcels.carrier, trackingNumber: parcels.trackingNumber, status: parcels.status })
      .from(parcels)
      .where(eq(parcels.orderId, order.id))
      .orderBy(asc(parcels.createdAt)),
  ]);
  return {
    id: order.id,
    number: orderNumber(order.seq),
    status: order.status,
    createdAt: order.createdAt.toISOString(),
    paidAt: order.paidAt?.toISOString() ?? null,
    country: order.country,
    address: order.address,
    invoice: order.invoice ?? null,
    lines: lines.map((l) => ({
      id: l.id,
      title: l.title,
      version: l.version,
      sku: l.sku,
      unitPriceCents: l.unitPriceCents,
      qty: l.qty,
      lineTotalCents: l.lineTotalCents,
      vatCents: l.vatCents,
      dispatchEstimate: l.dispatchEstimate,
      refundedQty: l.refundedQty,
    })),
    goodsCents: order.goodsCents,
    shippingCents: order.shippingCents,
    totalCents: order.totalCents,
    vatRate: order.vatRateBp / 10_000,
    vatCents: order.vatCents,
    kummies: order.customerId ? order.kummies : 0,
    events: events
      .filter((e) => e.toStatus !== null)
      .map((e) => ({ status: e.toStatus as OrderRow["status"], at: e.at.toISOString() })),
    canPay: order.status === "pending_payment",
    canCancel: customerCanCancel(order.status),
    documents: documents.map((d) => ({
      id: d.id,
      kind: d.kind,
      number: formatDocNumber(d.number),
      issuedAt: d.issuedAt.toISOString(),
    })),
    parcels: parcelRows.filter((p) => p.status !== "cancelled"),
    canComplain: canComplain(order),
    complaints: await orderComplaints(db, order.id),
    withdrawal: await withdrawalInfo(db, order, lines),
    returns: await orderReturns(db, order.id),
    invoiceRequestUntil: invoiceWindow(
      order,
      documents.map((d) => d.kind),
      (await loadCompanySettings(db)).invoiceRequestDays,
    ),
  };
}
