import { customerSeesChange, customerStep, formatMoney, isOffTrack, staffNextStatuses } from "@kummie/core";
import type { OrderStatus } from "@kummie/contracts";
import { t, type MessageKey } from "@kummie/i18n";
import { and, eq, inArray } from "drizzle-orm";
import { kummiesLedger, orders, payments, refunds } from "../db/schema";
import { enqueue } from "../jobs/outbox";
import { orderLink, orderNumber, transition, type OrderRow, type ShopDeps, type Tx } from "./orders";

export class StatusChangeError extends Error {
  constructor(
    readonly code: "not_allowed" | "refund_failed",
    message: string,
  ) {
    super(message);
    this.name = "StatusChangeError";
  }
}

/** Plain-words line for the customer about a status (step label or off-track explanation). */
function statusLine(locale: "bg" | "en", status: OrderStatus): string {
  const step = customerStep(status);
  if (step) return t(locale, `step.${step}` as MessageKey);
  if (isOffTrack(status)) return t(locale, `status.${status}` as MessageKey);
  return t(locale, "status.pending_payment");
}

/** Status e-mail (transactional, never with marketing): one per step the customer can see. */
async function queueStatusEmail(deps: ShopDeps, tx: Tx, order: OrderRow, to: OrderStatus, refundCents = 0) {
  const locale = order.locale;
  const site = `${deps.webUrl.replace(/\/$/, "")}/${locale}`;
  const link = orderLink(deps, order);
  const number = orderNumber(order.seq);
  const line =
    to === "refunded"
      ? t(locale, "email.refunded.line", { amount: formatMoney(refundCents, locale) })
      : statusLine(locale, to);
  const key = `order-status:${order.id}:${to}`;
  const text = [
    t(locale, "email.status.body", { name: order.address.name, number, line, link }),
    "",
    t(locale, "email.signoff", { site }),
  ].join("\n");
  const message = {
    to: order.email,
    subject: t(locale, "email.status.subject", { number, status: statusLine(locale, to) }),
    text,
    locale,
    category: "transactional",
    idempotencyKey: key,
    cta: { label: t(locale, "email.cta.order"), url: link },
  };
  await enqueue(tx, "email", message, key);
}

/**
 * Cancels an order. Before payment it is simply closed. After payment the full amount goes back
 * through the provider (refunded first, recorded after — the idempotency key makes a retry safe),
 * the order ends as `refunded` and the Kummies it earned are revoked (D-032).
 */
async function cancel(deps: ShopDeps, order: OrderRow, actor: string, note: string | null) {
  const { db } = deps;
  if (order.status === "pending_payment") {
    await db.transaction(async (tx) => {
      await transition(tx, order, "cancelled", actor, "cancelled", note ? { note } : {});
      await tx
        .update(payments)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(and(eq(payments.orderId, order.id), eq(payments.status, "pending")));
      await queueStatusEmail(deps, tx, order, "cancelled");
    });
    return;
  }

  const [payment] = await db
    .select()
    .from(payments)
    .where(and(eq(payments.orderId, order.id), inArray(payments.status, ["captured", "authorized"])));
  if (!payment?.providerPaymentId)
    throw new StatusChangeError("refund_failed", "No captured payment to refund");
  const idempotencyKey = `refund:${order.id}:full`;
  let providerRefund: { refundId: string; status: "succeeded" | "pending" | "failed" };
  try {
    providerRefund = await deps.payments.refund({
      paymentId: payment.providerPaymentId,
      amount: { amountCents: payment.amountCents, currency: "EUR" },
      reason: "cancelled",
      idempotencyKey,
    });
  } catch (error) {
    throw new StatusChangeError("refund_failed", error instanceof Error ? error.message : String(error));
  }
  if (providerRefund.status === "failed")
    throw new StatusChangeError("refund_failed", "The provider refused the refund");

  await db.transaction(async (tx) => {
    await transition(tx, order, "cancelled", actor, "cancelled", note ? { note } : {});
    await tx
      .insert(refunds)
      .values({
        orderId: order.id,
        paymentId: payment.id,
        providerRefundId: providerRefund.refundId,
        amountCents: payment.amountCents,
        reason: "cancelled",
        status: providerRefund.status,
        actor,
        idempotencyKey,
      })
      .onConflictDoNothing();
    await tx
      .update(payments)
      .set({ status: "refunded", updatedAt: new Date() })
      .where(eq(payments.id, payment.id));
    await transition(tx, { ...order, status: "cancelled" }, "refunded", "provider", "refunded", {
      amountCents: payment.amountCents,
    });
    if (order.customerId) {
      const [earned] = await tx
        .select({ amount: kummiesLedger.amount })
        .from(kummiesLedger)
        .where(and(eq(kummiesLedger.orderId, order.id), eq(kummiesLedger.kind, "earn")));
      if (earned && earned.amount > 0) {
        await tx
          .insert(kummiesLedger)
          .values({ customerId: order.customerId, orderId: order.id, kind: "revoke", amount: -earned.amount })
          .onConflictDoNothing();
      }
    }
    await queueStatusEmail(deps, tx, order, "refunded", payment.amountCents);
  });
}

/**
 * The one way an order changes status outside payment: customer cancellation or staff action.
 * Checks the allowed moves (`staffNextStatuses`), writes the event, and e-mails the customer when
 * they would see a different step.
 */
export async function changeOrderStatus(
  deps: ShopDeps,
  orderId: string,
  to: OrderStatus,
  actor: string,
  note: string | null = null,
): Promise<OrderRow> {
  const { db } = deps;
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw new StatusChangeError("not_allowed", "No such order");
  if (!staffNextStatuses(order.status).includes(to)) {
    throw new StatusChangeError("not_allowed", `Cannot go from ${order.status} to ${to}`);
  }
  if (to === "cancelled") {
    await cancel(deps, order, actor, note);
  } else {
    await db.transaction(async (tx) => {
      const [locked] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
      if (!locked || locked.status !== order.status)
        throw new StatusChangeError("not_allowed", "Changed meanwhile");
      await transition(tx, locked, to, actor, "status", note ? { note } : {});
      if (customerSeesChange(locked.status, to)) await queueStatusEmail(deps, tx, locked, to);
    });
  }
  deps.kick?.();
  const [updated] = await db.select().from(orders).where(eq(orders.id, orderId));
  return updated as OrderRow;
}
