import { splitCents } from "./cart";
import { BUSINESS_TIME_ZONE } from "./kummies";

/**
 * Supplier batches (M2, ARCHITECTURE §5, concept v3 §1): paid orders wait in the supplier's open
 * batch; the batch closes on fixed days and becomes one purchase order. Pure rules only.
 */

/** When batches close: ISO weekdays (1 = Monday … 7 = Sunday) at hour:minute, Sofia time. */
export type BatchSchedule = { weekdays: readonly number[]; hour: number; minute?: number };

/** Owner decision (D-063, B1): Monday and Thursday at 08:30 while orders are few. */
export const DEFAULT_BATCH_SCHEDULE: BatchSchedule = { weekdays: [1, 4], hour: 8, minute: 30 };

/** B2 (D-063): a batch below the supplier's minimum waits at most this long past its first closing. */
export const MAX_MINIMUM_WAIT_DAYS = 7;

function sofiaParts(ms: number) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(new Date(ms));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday")) + 1;
  return {
    y: Number(get("year")),
    m: Number(get("month")),
    d: Number(get("day")),
    h: Number(get("hour")),
    min: Number(get("minute")),
    s: Number(get("second")),
    weekday,
  };
}

/** The instant of a Sofia wall-clock time (handles summer/winter time). */
export function sofiaTime(y: number, m: number, d: number, hour: number, minute = 0): Date {
  const guess = Date.UTC(y, m - 1, d, hour, minute);
  const p = sofiaParts(guess);
  const offset = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - guess;
  return new Date(guess - offset);
}

/** The next closing time strictly after `after`. */
export function nextBatchCloseAt(after: Date, schedule: BatchSchedule = DEFAULT_BATCH_SCHEDULE): Date {
  if (schedule.weekdays.length === 0) throw new Error("A batch schedule needs at least one weekday");
  if (!Number.isInteger(schedule.hour) || schedule.hour < 0 || schedule.hour > 23)
    throw new Error("Batch hour must be 0–23");
  const minute = schedule.minute ?? 0;
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) throw new Error("Batch minute must be 0–59");
  const today = sofiaParts(after.getTime());
  for (let i = 0; i <= 7; i++) {
    const day = new Date(Date.UTC(today.y, today.m - 1, today.d + i));
    const weekday = ((today.weekday - 1 + i) % 7) + 1;
    if (!schedule.weekdays.includes(weekday)) continue;
    const at = sofiaTime(
      day.getUTCFullYear(),
      day.getUTCMonth() + 1,
      day.getUTCDate(),
      schedule.hour,
      minute,
    );
    if (at.getTime() > after.getTime()) return at;
  }
  throw new Error("unreachable: a weekly schedule always has a next closing time");
}

/**
 * B2 (D-063): should a batch below the supplier's minimum wait for the next closing? Only while that
 * next closing is at most MAX_MINIMUM_WAIT_DAYS after the batch's first closing time.
 */
export function waitForMinimum(input: {
  totalCents: number;
  minOrderCents: number;
  firstClosesAt: Date;
  nextCloseAt: Date;
}): boolean {
  if (input.minOrderCents <= 0 || input.totalCents >= input.minOrderCents) return false;
  const limit = input.firstClosesAt.getTime() + MAX_MINIMUM_WAIT_DAYS * 24 * 60 * 60_000;
  return input.nextCloseAt.getTime() <= limit;
}

/** An active offer for a variant, with what decides between suppliers (B3). */
export type OfferChoice = { supplierId: string; inEu: boolean; unitCostCents: number };

/**
 * B3 (D-063): an EU supplier always wins over a non-EU one (faster, no customs); between equals the
 * cheapest wins, then the supplier id so the choice is stable. Returns null when there is no offer.
 */
export function pickOffer<T extends OfferChoice>(offers: readonly T[]): T | null {
  const sorted = offers.toSorted(
    (a, b) =>
      Number(b.inEu) - Number(a.inEu) ||
      a.unitCostCents - b.unitCostCents ||
      a.supplierId.localeCompare(b.supplierId),
  );
  return sorted[0] ?? null;
}

export type BatchLine = {
  supplierSku: string;
  description: string;
  quantity: number;
  /** Agreed unit cost in integer euro cents. */
  unitCostCents: number;
};

/**
 * Lines of one purchase order: the same supplier SKU from many customer orders becomes one line.
 * A SKU with two different costs in one batch is a data error (the offer changed mid-batch).
 */
export function consolidateLines(lines: readonly BatchLine[]): BatchLine[] {
  const bySku = new Map<string, BatchLine>();
  for (const line of lines) {
    if (!Number.isInteger(line.quantity) || line.quantity <= 0)
      throw new Error(`Invalid quantity for ${line.supplierSku}`);
    const seen = bySku.get(line.supplierSku);
    if (!seen) {
      bySku.set(line.supplierSku, { ...line });
      continue;
    }
    if (seen.unitCostCents !== line.unitCostCents)
      throw new Error(`Two costs for ${line.supplierSku} in one batch`);
    seen.quantity += line.quantity;
  }
  return [...bySku.values()].toSorted((a, b) => a.supplierSku.localeCompare(b.supplierSku));
}

export function purchaseOrderTotalCents(lines: readonly BatchLine[]): number {
  return lines.reduce((sum, l) => sum + l.quantity * l.unitCostCents, 0);
}

const csvCell = (value: string | number) => {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** The purchase order as CSV for the supplier (English headers, comma-separated, euro amounts). */
export function purchaseOrderCsv(reference: string, lines: readonly BatchLine[]): string {
  const euro = (cents: number) => (cents / 100).toFixed(2);
  const rows = [
    ["po_reference", "supplier_sku", "description", "quantity", "unit_cost_eur", "line_total_eur"],
    ...lines.map((l) => [
      reference,
      l.supplierSku,
      l.description,
      l.quantity,
      euro(l.unitCostCents),
      euro(l.quantity * l.unitCostCents),
    ]),
  ];
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/**
 * Landed cost (concept v3 §3.2): shipping, duty and handling of a batch are spread over its lines
 * by goods value, so every unit gets a real cost for margin reports. Returns cents per line.
 */
export function allocateLandedCost(lines: readonly BatchLine[], extraCents: number): number[] {
  const values = lines.map((l) => l.quantity * l.unitCostCents);
  return splitCents(extraCents, values).map((extra, i) => (values[i] ?? 0) + extra);
}

export type BatchStatus = "open" | "closed" | "ordered" | "shipped" | "received";

/** Order statuses that batches move (B10), in order. */
export const BATCH_ORDER_STATUSES = [
  "batched",
  "ordered_from_supplier",
  "supplier_shipped",
  "received_at_hub",
] as const;
export type BatchOrderStatus = (typeof BATCH_ORDER_STATUSES)[number];

const LEVEL: Record<BatchStatus, number> = { open: 0, closed: 0, ordered: 1, shipped: 2, received: 3 };

/**
 * How far an order has come through its batches: the slowest line decides (B10). A line of a
 * received batch counts as received only when all its units were counted at the hub (B5).
 */
export function orderProgressFromBatches(
  lines: readonly { batchStatus: BatchStatus; qty: number; receivedQty: number }[],
): BatchOrderStatus | null {
  if (lines.length === 0) return null;
  const level = Math.min(
    ...lines.map((l) => {
      const base = LEVEL[l.batchStatus];
      return base === 3 && l.receivedQty < l.qty ? 2 : base;
    }),
  );
  return BATCH_ORDER_STATUSES[level] ?? null;
}

/** Purchase order reference for people and suppliers: PO-2026-0007. */
export function purchaseOrderReference(year: number, seq: number): string {
  return `PO-${year}-${String(seq).padStart(4, "0")}`;
}
