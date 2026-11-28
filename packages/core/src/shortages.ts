/**
 * Missing and damaged units after receiving (D-063 B5, D-064): which order lines are short, the
 * supplier's 3 working days, and the money of a partial refund. Pure functions; the API stores and
 * refunds.
 */
import { addDays, kummiesEarned } from "./kummies";

/** Working days the supplier has to send the missing units (D-063 B5). */
export const SHORTAGE_WAIT_WORKING_DAYS = 3;

/** Adds working days (Monday–Friday) to an ISO date; no holiday calendar (D-063). */
export function addWorkingDays(isoDay: string, days: number): string {
  let day = isoDay;
  let left = days;
  while (left > 0) {
    day = addDays(day, 1);
    const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
    if (weekday !== 0 && weekday !== 6) left -= 1;
  }
  return day;
}

export type ShortLine = { id: string; qty: number; receivedQty: number };
export type Shortfall = { lineId: string; kind: "damaged" | "missing"; qty: number };

/**
 * The units a batch line did not get, split into damaged (counted first, up to the units marked
 * damaged for that supplier SKU) and missing. Lines are served in the given order (oldest first).
 */
export function shortfalls(lines: readonly ShortLine[], damagedQty: number): Shortfall[] {
  let damaged = Math.max(0, damagedQty);
  const out: Shortfall[] = [];
  for (const line of lines) {
    let short = Math.max(0, line.qty - line.receivedQty);
    if (short === 0) continue;
    const fromDamaged = Math.min(short, damaged);
    damaged -= fromDamaged;
    short -= fromDamaged;
    if (fromDamaged > 0) out.push({ lineId: line.id, kind: "damaged", qty: fromDamaged });
    if (short > 0) out.push({ lineId: line.id, kind: "missing", qty: short });
  }
  return out;
}

/**
 * Money for `qty` units of an order line: the unit price incl. VAT and the matching share of the
 * line's VAT (the whole line's VAT when every unit goes back, so nothing is lost to rounding).
 */
export function refundOfUnits(
  line: { qty: number; unitPriceCents: number; vatCents: number },
  qty: number,
): { totalCents: number; vatCents: number } {
  if (!Number.isInteger(qty) || qty < 1 || qty > line.qty)
    throw new Error(`Cannot refund ${qty} of ${line.qty}`);
  if (qty === line.qty) return { totalCents: line.unitPriceCents * qty, vatCents: line.vatCents };
  return {
    totalCents: line.unitPriceCents * qty,
    vatCents: Math.round((line.vatCents * qty) / line.qty),
  };
}

/** Kummies the order still earns after goods worth `refundedGoodsCents` went back (D-032). */
export function kummiesAfterRefund(goodsCents: number, refundedGoodsCents: number): number {
  return kummiesEarned(Math.max(0, goodsCents - refundedGoodsCents));
}
