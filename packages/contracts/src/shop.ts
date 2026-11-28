import { z } from "zod";
import { OrderComplaint } from "./complaints";
import { OrderReturn, WithdrawalInfo } from "./returns";
import { ParcelTracking } from "./operations";
import { AddressInput, ShippingCountry } from "./account";
import { Localized } from "./catalogue";

// ---------- Cart (M1 Task 6) ----------

export const MAX_LINE_QTY = 20;

export const CartLine = z.object({
  variantId: z.string(),
  slug: z.string(),
  title: z.string(),
  version: z.string(),
  sku: z.string(),
  priceCents: z.number().int(),
  qty: z.number().int().min(1),
  lineTotalCents: z.number().int(),
  dispatchEstimate: Localized,
  /** False when the product was unpublished, the version switched off or it does not ship there. */
  available: z.boolean(),
});
export type CartLine = z.infer<typeof CartLine>;

/** Everything the customer must see before paying (CLAUDE.md: transparent prices). */
export const CartQuote = z.object({
  goodsCents: z.number().int(),
  shippingCents: z.number().int(),
  totalCents: z.number().int(),
  vatRate: z.number(),
  vatCents: z.number().int(),
  /** Kummies the order earns — only for signed-in customers (A1). */
  kummies: z.number().int(),
  kummiesBaseCents: z.number().int(),
  shippingFeeCents: z.number().int(),
  freeShippingFromCents: z.number().int(),
});
export type CartQuote = z.infer<typeof CartQuote>;

export const Cart = z.object({
  lines: z.array(CartLine),
  country: ShippingCountry,
  count: z.number().int(),
  quote: CartQuote,
});
export type Cart = z.infer<typeof Cart>;

export const CartLineUpdate = z.object({
  variantId: z.string().uuid(),
  /** 0 removes the line. */
  qty: z.number().int().min(0).max(MAX_LINE_QTY),
  /** true adds to the current quantity (product page); false sets it (cart page). */
  add: z.boolean().default(false),
});
export type CartLineUpdate = z.input<typeof CartLineUpdate>;

export const CartCountryUpdate = z.object({ country: ShippingCountry });

// ---------- Checkout ----------

/** "Искам фактура" (A14): an individual (no ЕГН collected) or a Bulgarian company. */
export const InvoiceRequest = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("person"),
    name: z.string().trim().min(1).max(120),
    address: z.string().trim().min(3).max(300),
  }),
  z.object({
    kind: z.literal("company"),
    name: z.string().trim().min(1).max(200),
    eik: z.string().regex(/^(\d{9}|\d{13})$/),
    vatNumber: z
      .string()
      .regex(/^BG\d{9,10}$/)
      .nullable(),
    address: z.string().trim().min(3).max(300),
  }),
]);
export type InvoiceRequest = z.infer<typeof InvoiceRequest>;

export const DeliveryAddress = AddressInput.omit({ isDefault: true });
export type DeliveryAddress = z.infer<typeof DeliveryAddress>;

export const CheckoutRequest = z.object({
  /** Guests only; a signed-in customer's account e-mail is used. */
  email: z.string().trim().toLowerCase().email().max(200).optional(),
  locale: z.enum(["bg", "en"]),
  address: DeliveryAddress,
  invoice: InvoiceRequest.nullable(),
  /** Terms and the withdrawal information were shown and accepted before payment. */
  acceptTerms: z.literal(true),
  /** Signed-in customers: keep this address in the account. */
  saveAddress: z.boolean().default(false),
});
export type CheckoutRequest = z.input<typeof CheckoutRequest>;

export const CheckoutResponse = z.object({
  orderId: z.string(),
  number: z.string(),
  /** Guests: the key that opens the order page (also in the e-mail link). */
  orderKey: z.string().nullable(),
  /** Payment page of the provider; the browser goes there next. */
  redirectUrl: z.string(),
});
export type CheckoutResponse = z.infer<typeof CheckoutResponse>;

/** 409 from checkout: what changed in the cart since it was shown. */
export const CartProblem = z.object({
  variantId: z.string(),
  reason: z.enum(["unavailable", "not_shipped_to_country"]),
});

// ---------- Orders ----------

export const OrderStatus = z.enum([
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
]);
export type OrderStatus = z.infer<typeof OrderStatus>;

export const OrderLine = z.object({
  id: z.string(),
  title: z.string(),
  version: z.string(),
  sku: z.string(),
  unitPriceCents: z.number().int(),
  qty: z.number().int(),
  lineTotalCents: z.number().int(),
  vatCents: z.number().int(),
  dispatchEstimate: Localized,
  /** Units refunded instead of shipped (missing or damaged, D-064). */
  refundedQty: z.number().int(),
});

export const OrderDetail = z.object({
  id: z.string(),
  number: z.string(),
  status: OrderStatus,
  createdAt: z.string(),
  paidAt: z.string().nullable(),
  country: ShippingCountry,
  address: DeliveryAddress,
  invoice: InvoiceRequest.nullable(),
  lines: z.array(OrderLine),
  goodsCents: z.number().int(),
  shippingCents: z.number().int(),
  totalCents: z.number().int(),
  vatRate: z.number(),
  vatCents: z.number().int(),
  kummies: z.number().int(),
  /** Status history for the timeline (oldest first). */
  events: z.array(z.object({ status: OrderStatus, at: z.string() })),
  /** True while the order waits for payment, so the page can offer "Pay now". */
  canPay: z.boolean(),
  /** True until the order joins a supplier batch (A10); a paid order is refunded in full. */
  canCancel: z.boolean(),
  /** Sales documents (Н-18 receipt, invoice, storno, credit note) as PDF downloads. */
  documents: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(["receipt", "receipt_storno", "invoice", "credit_note"]),
      number: z.string(),
      issuedAt: z.string(),
    }),
  ),
  /** Parcels with the courier (tracking number), once the order is packed at the hub. */
  parcels: z.array(ParcelTracking),
  /**
   * Last day (Sofia, ISO date) the customer may still ask for an invoice for this paid order
   * (D-067); null when no request is possible (not paid, already invoiced, refunded, too late).
   */
  invoiceRequestUntil: z.iso.date().nullable(),
  /** "Подай рекламация" is offered (the order reached the customer, D-069). */
  canComplain: z.boolean(),
  complaints: z.array(OrderComplaint),
  /** "Откажи се" is offered: 14 days after delivery, with what can still go back (D-070). */
  withdrawal: WithdrawalInfo.nullable(),
  returns: z.array(OrderReturn),
});
export type OrderDetail = z.infer<typeof OrderDetail>;

export const OrderSummary = OrderDetail.pick({
  id: true,
  number: true,
  status: true,
  createdAt: true,
  totalCents: true,
});
export type OrderSummary = z.infer<typeof OrderSummary>;
export const OrderList = z.object({ items: z.array(OrderSummary) });

export const PayResponse = z.object({ redirectUrl: z.string() });

// ---------- Admin: orders (M1 Task 7) ----------

export const AdminOrderSummary = z.object({
  id: z.string(),
  number: z.string(),
  status: OrderStatus,
  createdAt: z.string(),
  email: z.string(),
  name: z.string(),
  country: ShippingCountry,
  totalCents: z.number().int(),
  guest: z.boolean(),
});
export type AdminOrderSummary = z.infer<typeof AdminOrderSummary>;
export const AdminOrderList = z.object({ items: z.array(AdminOrderSummary), total: z.number().int() });

export const AdminOrderListQuery = z.object({
  status: OrderStatus.optional(),
  /** Order number (KUM-1001 or 1001) or part of the e-mail. */
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
});

export const AdminOrderEvent = z.object({
  type: z.string(),
  fromStatus: OrderStatus.nullable(),
  toStatus: OrderStatus.nullable(),
  actor: z.string(),
  note: z.string().nullable(),
  at: z.string(),
});

export const AdminOrder = OrderDetail.extend({
  email: z.string(),
  guest: z.boolean(),
  history: z.array(AdminOrderEvent),
  payments: z.array(
    z.object({
      provider: z.string(),
      status: z.string(),
      amountCents: z.number().int(),
      createdAt: z.string(),
    }),
  ),
  refunds: z.array(
    z.object({
      amountCents: z.number().int(),
      reason: z.string(),
      status: z.string(),
      createdAt: z.string(),
    }),
  ),
  /** Statuses staff may set from here (`staffNextStatuses` in @kummie/core). */
  next: z.array(OrderStatus),
});
export type AdminOrder = z.infer<typeof AdminOrder>;

export const OrderStatusChange = z.object({
  to: OrderStatus,
  note: z.string().trim().max(500).optional(),
});
export type OrderStatusChange = z.infer<typeof OrderStatusChange>;
