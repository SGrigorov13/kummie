import { kummiesAfterRefund, refundOfUnits } from "@kummie/core";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { RefundInput } from "../adapters/payment";
import { kummiesLedger, orderLines, orders, payments, refunds } from "../db/schema";
import { issuePartialRefundDocuments } from "../documents/issue";
import type { OrderRow, Tx } from "./basics";
import { queueStatusEmail } from "./lifecycle";
import { transition, type ShopDeps } from "./orders";

export class PartialRefundError extends Error {
  constructor(
    readonly code: "not_found" | "not_allowed" | "refund_failed",
    message: string,
  ) {
    super(message);
    this.name = "PartialRefundError";
  }
}

export type RefundItem = { orderLineId: string; qty: number };

export type RefundRecorded = {
  tx: Tx;
  /** The order as it was before this refund (locked). */
  order: OrderRow;
  refundId: string;
  amountCents: number;
  /** Nothing is left: delivery was refunded too and the order is now `refunded`. */
  whole: boolean;
  documentIds: string[];
};

/**
 * Refunds some units of a paid order (missing or damaged units D-068, withdrawal D-070): the card
 * gets their price incl. VAT back — plus the delivery when nothing is left — through the payment
 * adapter (one idempotency key per case), then in one transaction: the refund row, the lines'
 * `refunded_qty`, the payment status, the Kummies re-count (D-032), a storno and credit note for
 * just those lines with the reason, and `onRecorded` for the caller's own rows and e-mail. When
 * nothing is left the order becomes `refunded` and the customer gets the status e-mail.
 */
export async function refundUnits(
  shop: ShopDeps,
  input: {
    orderId: string;
    items: readonly RefundItem[];
    reason: RefundInput["reason"];
    idempotencyKey: string;
    actor: string;
    /** Printed on the storno and credit note ("Основание: …"). */
    documentReason: string;
    onRecorded: (ctx: RefundRecorded) => Promise<void>;
  },
): Promise<{ amountCents: number; whole: boolean }> {
  const { db } = shop;
  const [order] = await db.select().from(orders).where(eq(orders.id, input.orderId));
  if (!order) throw new PartialRefundError("not_found", "No such order");
  const lines = await db.select().from(orderLines).where(eq(orderLines.orderId, order.id));
  const wanted = new Map<string, number>();
  for (const item of input.items)
    wanted.set(item.orderLineId, (wanted.get(item.orderLineId) ?? 0) + item.qty);
  if (wanted.size === 0) throw new PartialRefundError("not_allowed", "Nothing to refund");
  for (const [lineId, qty] of wanted) {
    const line = lines.find((l) => l.id === lineId);
    if (!line || qty < 1 || qty > line.qty - line.refundedQty)
      throw new PartialRefundError("not_allowed", "These units were already refunded");
  }
  const [payment] = await db
    .select()
    .from(payments)
    .where(and(eq(payments.orderId, order.id), inArray(payments.status, ["captured", "partially_refunded"])));
  if (!payment?.providerPaymentId)
    throw new PartialRefundError("not_allowed", "No captured payment to refund");

  const left = lines.reduce((sum, l) => sum + l.qty - l.refundedQty, 0);
  const refundedNow = [...wanted.values()].reduce((a, b) => a + b, 0);
  const whole = left === refundedNow;
  const parts = [...wanted].map(([lineId, qty]) => {
    const line = lines.find((l) => l.id === lineId) as (typeof lines)[number];
    return { line, qty, ...refundOfUnits(line, qty) };
  });
  const amountCents = parts.reduce((sum, p) => sum + p.totalCents, 0) + (whole ? order.shippingCents : 0);
  const [{ done } = { done: 0 }] = await db
    .select({ done: sql<number>`coalesce(sum(${refunds.amountCents}), 0)::int` })
    .from(refunds)
    .where(and(eq(refunds.orderId, order.id), inArray(refunds.status, ["succeeded", "pending"])));
  if (done + amountCents > payment.amountCents)
    throw new PartialRefundError("not_allowed", "More than the payment would be refunded");

  let providerRefund: { refundId: string; status: "succeeded" | "pending" | "failed" };
  try {
    providerRefund = await shop.payments.refund({
      paymentId: payment.providerPaymentId,
      amount: { amountCents, currency: "EUR" },
      reason: input.reason,
      idempotencyKey: input.idempotencyKey,
    });
  } catch (error) {
    throw new PartialRefundError("refund_failed", error instanceof Error ? error.message : String(error));
  }
  if (providerRefund.status === "failed")
    throw new PartialRefundError("refund_failed", "The provider refused the refund");

  await db.transaction(async (tx) => {
    const [locked] = await tx.select().from(orders).where(eq(orders.id, order.id)).for("update");
    if (!locked) throw new PartialRefundError("not_found", "No such order");
    const [refund] = await tx
      .insert(refunds)
      .values({
        orderId: order.id,
        paymentId: payment.id,
        providerRefundId: providerRefund.refundId,
        amountCents,
        reason: input.reason,
        status: providerRefund.status,
        actor: input.actor,
        idempotencyKey: input.idempotencyKey,
      })
      .onConflictDoNothing()
      .returning({ id: refunds.id });
    if (!refund) throw new PartialRefundError("not_allowed", "This refund was already recorded");
    for (const p of parts) {
      await tx
        .update(orderLines)
        .set({ refundedQty: sql`${orderLines.refundedQty} + ${p.qty}` })
        .where(eq(orderLines.id, p.line.id));
    }
    await tx
      .update(payments)
      .set({ status: whole ? "refunded" : "partially_refunded", updatedAt: new Date() })
      .where(eq(payments.id, payment.id));

    // Kummies re-counted without the refunded goods (D-032): one "revoke" row per order, updated.
    const refundedGoods = lines.reduce(
      (sum, l) => sum + l.unitPriceCents * (l.refundedQty + (wanted.get(l.id) ?? 0)),
      0,
    );
    const kummies = kummiesAfterRefund(locked.goodsCents, refundedGoods);
    if (locked.customerId) {
      const [earned] = await tx
        .select({ amount: kummiesLedger.amount })
        .from(kummiesLedger)
        .where(and(eq(kummiesLedger.orderId, order.id), eq(kummiesLedger.kind, "earn")));
      const revoke = Math.max(0, (earned?.amount ?? 0) - kummies);
      if (revoke > 0) {
        await tx
          .insert(kummiesLedger)
          .values({ customerId: locked.customerId, orderId: order.id, kind: "revoke", amount: -revoke })
          .onConflictDoUpdate({
            target: [kummiesLedger.orderId, kummiesLedger.kind],
            set: { amount: -revoke, at: new Date() },
          });
      }
    }
    await tx.update(orders).set({ kummies, updatedAt: new Date() }).where(eq(orders.id, order.id));

    const docLines = [
      ...parts.map((p) => ({
        name: `${p.line.title} (${p.line.version})`,
        qty: p.qty,
        unitPriceCents: p.line.unitPriceCents,
        totalCents: -p.totalCents,
        vatCents: -p.vatCents,
      })),
      ...(whole && order.shippingCents > 0
        ? [
            {
              name: "Доставка",
              qty: 1,
              unitPriceCents: order.shippingCents,
              totalCents: -order.shippingCents,
              vatCents: -order.shippingVatCents,
            },
          ]
        : []),
    ];
    const documents = await issuePartialRefundDocuments(
      tx,
      locked,
      refund.id,
      docLines,
      input.documentReason,
    );
    const documentIds = documents.map((d) => d.id);
    if (whole) {
      await transition(tx, locked, "refunded", input.actor, "refunded", { amountCents });
      await queueStatusEmail(shop, tx, locked, "refunded", amountCents, documentIds);
    }
    await input.onRecorded({ tx, order: locked, refundId: refund.id, amountCents, whole, documentIds });
  });
  shop.kick?.();
  return { amountCents, whole };
}
