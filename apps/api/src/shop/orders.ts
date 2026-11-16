import type { OrderDetail } from "@kummie/contracts";
import { businessDay, formatMoney, kummiesValidUntil, splitCents } from "@kummie/core";
import { t } from "@kummie/i18n";
import { asc, eq } from "drizzle-orm";
import type { PaymentEvent, PaymentProvider } from "../adapters/payment";
import type { FakePaymentProvider } from "../adapters/fake-payment";
import type { AccountDeps } from "../accounts/context";
import type { Database } from "../db/client";
import { kummiesLedger, orderEvents, orderLines, orders, payments } from "../db/schema";
import { enqueue } from "../jobs/outbox";
import { clearBought } from "./cart-store";

export type ShopDeps = AccountDeps & {
  payments: PaymentProvider;
  /** Present when PAYMENT_PROVIDER=fake: serves the hosted "pay / fail" test page. */
  fakePayments?: FakePaymentProvider;
};

export type OrderRow = typeof orders.$inferSelect;
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export const orderNumber = (seq: number | null) => `KUM-${seq ?? 0}`;

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

async function transition(
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

function paidEmail(deps: ShopDeps, order: OrderRow, dispatch: string, key: string) {
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
      link: `${site}/orders/${order.id}${!order.customerId && order.accessKey ? `#k=${order.accessKey}` : ""}`,
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
  // Capture right away: pre-orders take weeks and card authorisations expire after days.
  await deps.payments.capture(event.paymentId);

  const applied = await db.transaction(async (tx) => {
    const [locked] = await tx.select().from(orders).where(eq(orders.id, order.id)).for("update");
    if (!locked || locked.status !== "pending_payment") return false;
    await tx
      .update(payments)
      .set({ status: "captured", providerPaymentId: event.paymentId, updatedAt: new Date() })
      .where(eq(payments.id, payment.id));
    await transition(tx, locked, "paid", "provider", "paid", { paymentId: payment.id });
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
      paidEmail(deps, locked, dispatch, key) as unknown as Record<string, unknown>,
      key,
    );
    return true;
  });
  if (applied) deps.kick?.();
  return applied ? "applied" : "ignored";
}

/** The order as the customer sees it. */
export async function orderDetail(db: Database, order: OrderRow): Promise<OrderDetail> {
  const [lines, events] = await Promise.all([
    db.select().from(orderLines).where(eq(orderLines.orderId, order.id)).orderBy(asc(orderLines.position)),
    db.select().from(orderEvents).where(eq(orderEvents.orderId, order.id)).orderBy(asc(orderEvents.at)),
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
      title: l.title,
      version: l.version,
      sku: l.sku,
      unitPriceCents: l.unitPriceCents,
      qty: l.qty,
      lineTotalCents: l.lineTotalCents,
      vatCents: l.vatCents,
      dispatchEstimate: l.dispatchEstimate,
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
  };
}
