import { z } from "zod";

/** Couriers the customer can send the return with (D-063 B6). */
export const ReturnCourier = z.enum(["speedy", "econt", "boxnow"]);
export type ReturnCourier = z.infer<typeof ReturnCourier>;

export const ReturnStatus = z.enum(["requested", "received", "refunded", "rejected"]);
export const ReturnDecision = z.enum(["pending", "accepted", "refused"]);

/** "Откажи се" from the order page within 14 days of delivery (D-070). */
export const ReturnRequest = z.object({
  courier: ReturnCourier,
  lines: z
    .array(z.object({ orderLineId: z.uuid(), qty: z.number().int().min(1).max(99) }))
    .min(1)
    .max(50),
  /** Optional; the customer need not give a reason. */
  reason: z.string().trim().max(1000).nullable(),
});
export type ReturnRequest = z.infer<typeof ReturnRequest>;

/** What the customer may still send back, until when. */
export const WithdrawalInfo = z.object({
  until: z.iso.date(),
  lines: z.array(
    z.object({
      orderLineId: z.string(),
      title: z.string(),
      version: z.string(),
      returnableQty: z.number().int(),
    }),
  ),
});

/** A return as the customer sees it in the order. */
export const OrderReturn = z.object({
  number: z.string(),
  status: ReturnStatus,
  courier: ReturnCourier,
  createdAt: z.string(),
  refundDueOn: z.iso.date(),
  lines: z.array(
    z.object({
      title: z.string(),
      version: z.string(),
      qty: z.number().int(),
      decision: ReturnDecision,
      refuseReason: z.string().nullable(),
    }),
  ),
});

/** Пункт България → Връщания. */
export const AdminReturn = z.object({
  id: z.string(),
  number: z.string(),
  status: ReturnStatus,
  orderId: z.string(),
  orderNumber: z.string(),
  name: z.string(),
  email: z.string(),
  courier: ReturnCourier,
  reason: z.string().nullable(),
  createdAt: z.string(),
  /** The money must be back by this day (14 days after the request). */
  refundDueOn: z.iso.date(),
  overdue: z.boolean(),
  receivedAt: z.string().nullable(),
  lines: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      version: z.string(),
      sku: z.string(),
      qty: z.number().int(),
      unitPriceCents: z.number().int(),
      decision: ReturnDecision,
      refuseReason: z.string().nullable(),
      disposition: z.enum(["to_supplier", "keep"]).nullable(),
    }),
  ),
  /** Accepted units at their price (plus delivery when nothing else is left in the order). */
  refundCents: z.number().int(),
});
export type AdminReturn = z.infer<typeof AdminReturn>;
export const ReturnList = z.object({ items: z.array(AdminReturn) });
export type ReturnList = z.infer<typeof ReturnList>;

/** Staff check each line of the parcel. */
export const ReturnDecisionInput = z.object({
  lines: z
    .array(
      z.object({
        id: z.uuid(),
        decision: z.enum(["accepted", "refused"]),
        refuseReason: z.string().trim().max(500).nullable(),
        disposition: z.enum(["to_supplier", "keep"]).nullable(),
      }),
    )
    .min(1),
});
export type ReturnDecisionInput = z.infer<typeof ReturnDecisionInput>;
