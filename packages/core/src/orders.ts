/** Internal order states (ARCHITECTURE §4). */
export const ORDER_STATUSES = [
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
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** The seven steps the customer sees (concept v3 §1a). Labels live in `@kummie/i18n`. */
export const CUSTOMER_STEPS = [
  "confirmed",
  "batch",
  "dispatched",
  "hub",
  "carrier",
  "out_for_delivery",
  "delivered",
] as const;
export type CustomerStep = (typeof CUSTOMER_STEPS)[number];

/** States explained in plain words instead of a step. */
export const OFF_TRACK_STATUSES = ["cancelled", "refunded", "partially_refunded", "exception"] as const;
export type OffTrackStatus = (typeof OFF_TRACK_STATUSES)[number];

const STEP_OF: Record<OrderStatus, CustomerStep | null> = {
  pending_payment: null,
  paid: "confirmed",
  batched: "batch",
  ordered_from_supplier: "batch",
  supplier_shipped: "dispatched",
  received_at_hub: "hub",
  packed: "carrier",
  handed_to_carrier: "carrier",
  out_for_delivery: "out_for_delivery",
  delivered: "delivered",
  cancelled: null,
  refunded: null,
  partially_refunded: null,
  exception: null,
};

/** Customer-facing step for an internal status, or null when there is none to show. */
export function customerStep(status: OrderStatus): CustomerStep | null {
  return STEP_OF[status];
}

/** 1-based step number (1–7) for an internal status, or null. */
export function customerStepNumber(status: OrderStatus): number | null {
  const step = STEP_OF[status];
  return step ? CUSTOMER_STEPS.indexOf(step) + 1 : null;
}

export function isOffTrack(status: OrderStatus): status is OffTrackStatus {
  return (OFF_TRACK_STATUSES as readonly string[]).includes(status);
}

/** The happy path from payment to delivery, in order. */
export const HAPPY_PATH: readonly OrderStatus[] = [
  "paid",
  "batched",
  "ordered_from_supplier",
  "supplier_shipped",
  "received_at_hub",
  "packed",
  "handed_to_carrier",
  "out_for_delivery",
  "delivered",
];

/** Next status on the happy path, or null at the end / off the path. */
export function nextHappyStatus(status: OrderStatus): OrderStatus | null {
  const index = HAPPY_PATH.indexOf(status);
  if (index < 0 || index === HAPPY_PATH.length - 1) return null;
  return HAPPY_PATH[index + 1] ?? null;
}
