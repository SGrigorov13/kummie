import { z } from "zod";

/** M2 operations: suppliers, batches, the Bulgaria hub and parcels (docs/specs/M2-operations.md). */

export const SupplierId = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{1,30}$/, "lower-case letters, digits and dashes");

export const Supplier = z.object({
  id: SupplierId,
  name: z.string().trim().min(1).max(120),
  orderEmail: z.string().email().nullable(),
  closeWeekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
  closeHour: z.number().int().min(0).max(23),
  closeMinute: z.number().int().min(0).max(59),
  minOrderCents: z.number().int().min(0),
  ddp: z.boolean(),
  /** Ships from inside the EU; EU suppliers win over non-EU ones (D-063). */
  inEu: z.boolean(),
  /** Purchase orders go out by themselves; off = staff send the file and mark it ordered (D-063). */
  autoSend: z.boolean(),
  /** Working days from the batch closing to the hub — the delivery estimate uses them (D-071). */
  transitDaysMin: z.number().int().min(0).max(60).default(2),
  transitDaysMax: z.number().int().min(0).max(60).default(5),
  active: z.boolean(),
});
export type Supplier = z.infer<typeof Supplier>;
export const SupplierList = z.object({ items: z.array(Supplier) });

export const SupplierOffer = z.object({
  id: z.string(),
  supplierId: z.string(),
  /** Our variant SKU. */
  sku: z.string(),
  title: z.string(),
  version: z.string(),
  supplierSku: z.string(),
  unitCostCents: z.number().int().positive(),
  priceCents: z.number().int(),
  active: z.boolean(),
});
export type SupplierOffer = z.infer<typeof SupplierOffer>;
export const SupplierOfferList = z.object({
  items: z.array(SupplierOffer),
  /** Active variants of published products without any active offer (paid orders would wait). */
  withoutOffer: z.array(z.object({ sku: z.string(), title: z.string(), version: z.string() })),
});
export type SupplierOfferList = z.infer<typeof SupplierOfferList>;

export const SupplierOfferInput = z.object({
  sku: z.string().trim().min(1).max(64),
  supplierSku: z.string().trim().min(1).max(64),
  unitCostCents: z.number().int().positive(),
  active: z.boolean(),
});
export type SupplierOfferInput = z.infer<typeof SupplierOfferInput>;

/** A supplier price list as CSV text (read in the browser): sku, supplier_sku, unit_cost_eur, active. */
export const OfferImportInput = z.object({ csv: z.string().min(1).max(2_000_000) });
export const OfferImportResult = z.object({
  saved: z.number().int(),
  issues: z.array(z.object({ row: z.number().int(), message: z.string() })),
  offers: SupplierOfferList,
});
export type OfferImportResult = z.infer<typeof OfferImportResult>;

/** Staff sent the purchase order themselves (D-063): the batch becomes "ordered". */
export const BatchOrdered = z.object({ supplierReference: z.string().trim().max(80).nullable() });

export const HubAddress = z.object({
  name: z.string().trim().min(1).max(120),
  line1: z.string().trim().min(1).max(200),
  city: z.string().trim().min(1).max(80),
  postcode: z.string().trim().min(1).max(20),
});
export type HubAddress = z.infer<typeof HubAddress>;
export const OperationsSettings = z.object({ hub: HubAddress.nullable() });
export type OperationsSettings = z.infer<typeof OperationsSettings>;

export const BatchStatus = z.enum(["open", "closed", "ordered", "shipped", "received"]);
export type BatchStatus = z.infer<typeof BatchStatus>;

export const BatchSummary = z.object({
  id: z.string(),
  supplierId: z.string(),
  supplierName: z.string(),
  status: BatchStatus,
  poReference: z.string().nullable(),
  closesAt: z.string(),
  orders: z.number().int(),
  units: z.number().int(),
  receivedUnits: z.number().int(),
  costCents: z.number().int(),
  supplierTracking: z.string().nullable(),
  orderedAt: z.string().nullable(),
  shippedAt: z.string().nullable(),
  receivedAt: z.string().nullable(),
});
export type BatchSummary = z.infer<typeof BatchSummary>;
export const BatchList = z.object({ items: z.array(BatchSummary) });

/** One supplier SKU in a batch (the lines of all orders added up). */
export const BatchItem = z.object({
  supplierSku: z.string(),
  sku: z.string(),
  description: z.string(),
  qty: z.number().int(),
  receivedQty: z.number().int(),
  unitCostCents: z.number().int(),
  /** Units marked damaged while receiving (D-063 B5); not counted as received. */
  damagedQty: z.number().int(),
  damagePhoto: z.boolean(),
});
export type BatchItem = z.infer<typeof BatchItem>;

export const BatchDetail = BatchSummary.extend({
  items: z.array(BatchItem),
  orderNumbers: z.array(z.string()),
});
export type BatchDetail = z.infer<typeof BatchDetail>;

export const BatchShipped = z.object({ tracking: z.string().trim().max(80).nullable() });
export const ScanInput = z.object({ code: z.string().trim().min(1).max(80) });
export const ReceivedQtyInput = z.object({
  supplierSku: z.string().min(1).max(64),
  receivedQty: z.number().int().min(0),
});

/** Damaged units of one supplier SKU while receiving (0 removes the record). */
export const DamageInput = z.object({
  supplierSku: z.string().min(1).max(64),
  qty: z.number().int().min(0).max(9999),
  note: z.string().trim().max(500).nullable(),
});
export type DamageInput = z.infer<typeof DamageInput>;

/** Units an order did not get (missing or damaged, D-064) — the "Липси" list. */
export const Shortage = z.object({
  id: z.string(),
  kind: z.enum(["missing", "damaged"]),
  status: z.enum(["open", "arrived", "refunded"]),
  qty: z.number().int(),
  /** The supplier's last working day to send them (3 working days, D-063 B5). */
  dueOn: z.iso.date(),
  /** The wait is over: staff may confirm the refund now. */
  due: z.boolean(),
  orderId: z.string(),
  orderNumber: z.string(),
  sku: z.string(),
  title: z.string(),
  version: z.string(),
  supplierSku: z.string(),
  supplierName: z.string(),
  poReference: z.string().nullable(),
  /** What the customer gets back (units at their price incl. VAT; plus delivery if nothing is left). */
  refundCents: z.number().int(),
  claimSentAt: z.string().nullable(),
  note: z.string().nullable(),
  /** Id of the damage record with a photo, for the claim to the supplier. */
  photoId: z.string().nullable(),
  createdAt: z.string(),
});
export type Shortage = z.infer<typeof Shortage>;
export const ShortageList = z.object({ items: z.array(Shortage) });
export type ShortageList = z.infer<typeof ShortageList>;

export const ScanResult = z.object({
  ok: z.boolean(),
  /** "unknown" (no such product here), "complete" (all units already counted) or null. */
  problem: z.enum(["unknown", "complete"]).nullable(),
  batch: BatchDetail,
});
export type ScanResult = z.infer<typeof ScanResult>;

export const PackLine = z.object({
  sku: z.string(),
  /** Supplier SKU too, so either barcode is accepted. */
  supplierSku: z.string().nullable(),
  title: z.string(),
  version: z.string(),
  qty: z.number().int(),
});
export const PackOrder = z.object({
  id: z.string(),
  number: z.string(),
  status: z.enum(["received_at_hub", "packed"]),
  name: z.string(),
  city: z.string(),
  country: z.enum(["BG", "RO", "GR"]),
  lines: z.array(PackLine),
  parcel: z
    .object({
      id: z.string(),
      carrier: z.string(),
      trackingNumber: z.string(),
      weightGrams: z.number().int(),
    })
    .nullable(),
});
export type PackOrder = z.infer<typeof PackOrder>;
export const PackQueue = z.object({ items: z.array(PackOrder) });
export type PackQueue = z.infer<typeof PackQueue>;

/**
 * The A4 packing list that goes into the parcel (D-065): what is inside, safety information and
 * warnings in the customer's language, the return address and how to withdraw. Name and city
 * only — the full address is on the courier label.
 */
export const PackingSlip = z.object({
  orderNumber: z.string(),
  /** When the order was paid (ISO). */
  orderedAt: z.string(),
  locale: z.enum(["bg", "en"]),
  recipient: z.object({ name: z.string(), city: z.string(), country: z.string() }),
  lines: z.array(
    z.object({ sku: z.string(), title: z.string(), version: z.string(), qty: z.number().int() }),
  ),
  /** Per product with safety information or warnings, in the customer's language. */
  safety: z.array(
    z.object({ title: z.string(), info: z.string().nullable(), warnings: z.array(z.string()) }),
  ),
  /** The hub address, which is also the return address (D-063); null until entered. */
  returnAddress: HubAddress.nullable(),
  /** The order page (without the guest key: customers open it from their e-mail or account). */
  orderUrl: z.string(),
  withdrawalUrl: z.string(),
  withdrawalDays: z.number().int(),
});
export type PackingSlip = z.infer<typeof PackingSlip>;

export const PackInput = z.object({
  /** Units scanned per our SKU; the server checks them against the order. */
  items: z.array(z.object({ sku: z.string().min(1).max(64), qty: z.number().int().positive() })).min(1),
  weightGrams: z.number().int().min(10).max(30_000),
});
export type PackInput = z.infer<typeof PackInput>;

export const HandOverInput = z.object({ trackingNumber: z.string().trim().min(1).max(80) });
export const HandOverResult = z.object({ orderNumber: z.string(), trackingNumber: z.string() });

/** What the customer sees once the parcel is with the courier. */
export const ParcelTracking = z.object({
  carrier: z.string(),
  trackingNumber: z.string(),
  status: z.enum(["labelled", "handed_over", "out_for_delivery", "delivered", "exception", "cancelled"]),
});
export type ParcelTracking = z.infer<typeof ParcelTracking>;

export const OperationsRun = z.object({
  assigned: z.number().int(),
  closed: z.number().int(),
  tracked: z.number().int(),
  waitingWithoutOffer: z.array(z.string()),
});
export type OperationsRun = z.infer<typeof OperationsRun>;
