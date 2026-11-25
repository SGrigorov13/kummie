import { splitCents } from "./cart";
import { BUSINESS_TIME_ZONE } from "./kummies";

/**
 * Supplier batches (M2, ARCHITECTURE §5, concept v3 §1): paid orders wait in the supplier's open
 * batch; the batch closes on fixed days and becomes one purchase order. Pure rules only.
 */

/** When batches close: ISO weekdays (1 = Monday … 7 = Sunday) at a whole hour, Sofia time. */
export type BatchSchedule = { weekdays: readonly number[]; hour: number };

/** Proposal (M2 spec B1): Monday, Wednesday and Friday at 12:00 — every 2–3 days. */
export const DEFAULT_BATCH_SCHEDULE: BatchSchedule = { weekdays: [1, 3, 5], hour: 12 };

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
export function sofiaTime(y: number, m: number, d: number, hour: number): Date {
  const guess = Date.UTC(y, m - 1, d, hour);
  const p = sofiaParts(guess);
  const offset = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - guess;
  return new Date(guess - offset);
}

/** The next closing time strictly after `after`. */
export function nextBatchCloseAt(after: Date, schedule: BatchSchedule = DEFAULT_BATCH_SCHEDULE): Date {
  if (schedule.weekdays.length === 0) throw new Error("A batch schedule needs at least one weekday");
  if (!Number.isInteger(schedule.hour) || schedule.hour < 0 || schedule.hour > 23)
    throw new Error("Batch hour must be 0–23");
  const today = sofiaParts(after.getTime());
  for (let i = 0; i <= 7; i++) {
    const day = new Date(Date.UTC(today.y, today.m - 1, today.d + i));
    const weekday = ((today.weekday - 1 + i) % 7) + 1;
    if (!schedule.weekdays.includes(weekday)) continue;
    const at = sofiaTime(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), schedule.hour);
    if (at.getTime() > after.getTime()) return at;
  }
  throw new Error("unreachable: a weekly schedule always has a next closing time");
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
