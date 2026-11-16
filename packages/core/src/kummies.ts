import { assertCents } from "./vat";

/**
 * Kummies — KUMMIE's loyalty points (D-027, D-030, D-031).
 *
 * Earning: 1 Kummie per whole euro of the order's goods incl. VAT, counted on the FINAL amount (after
 * any Kummies discount) and without delivery; only when that amount is at least €30.00.
 * Spending: 100 Kummies = €5 off.
 * Validity: points are recorded on the day the order is paid (Bulgarian time) and expire
 * KUMMIES_VALIDITY_MONTHS calendar months later. Reminders go out 14, 3 and 1 day before expiry.
 */

/** Minimum final goods amount incl. VAT (after discount, without delivery) to earn anything. */
export const KUMMIES_MIN_ORDER_CENTS = 3000;
/** 1 Kummie per whole euro — easy to check by eye. */
export const KUMMIES_PER_EUR = 1;
/** 100 Kummies buy €5 of store credit (D-030). */
export const KUMMIES_REDEEM_COST = 100;
export const KUMMIES_REDEEM_CENTS = 500;
/**
 * How long points stay valid: 6 calendar months from the payment day (D-031). Paid on 16 Nov →
 * usable up to and including 16 May. Changing it only affects points earned afterwards.
 */
export const KUMMIES_VALIDITY_MONTHS = 6;
/** Reminder schedule before expiry (push if allowed in the app, and e-mail). */
export const KUMMIES_REMINDER_DAYS_BEFORE = [14, 3, 1] as const;
export type KummiesReminderDay = (typeof KUMMIES_REMINDER_DAYS_BEFORE)[number];

/** Business days are Bulgarian days: a payment at 00:30 Sofia time belongs to that Sofia date. */
export const BUSINESS_TIME_ZONE = "Europe/Sofia";

// ---------- Earning ----------

/** The amount points are counted on: goods incl. VAT minus the discount, never below zero. */
export function kummiesBaseCents(goodsCents: number, discountCents: number): number {
  assertCents(goodsCents);
  assertCents(discountCents);
  return Math.max(0, goodsCents - Math.max(0, discountCents));
}

/** Kummies for a final goods amount incl. VAT (after discount, without delivery). */
export function kummiesEarned(baseCents: number): number {
  assertCents(baseCents);
  if (baseCents < KUMMIES_MIN_ORDER_CENTS) return 0;
  return Math.floor((baseCents * KUMMIES_PER_EUR) / 100);
}

// ---------- Dates ----------

/** ISO date (YYYY-MM-DD) of `date` in Bulgarian time. */
export function businessDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Adds whole days to an ISO date. */
export function addDays(isoDay: string, days: number): string {
  const [y, m, d] = isoDay.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * Adds calendar months to an ISO date. When the target month is shorter, the last day of that month
 * is used (31 Aug + 6 months → 28/29 Feb).
 */
export function addMonths(isoDay: string, months: number): string {
  const [y, m, d] = isoDay.split("-").map(Number) as [number, number, number];
  const lastDay = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + months, Math.min(d, lastDay))).toISOString().slice(0, 10);
}

/** Last day the points can be used (inclusive). */
export function kummiesValidUntil(earnedOn: string, validityMonths = KUMMIES_VALIDITY_MONTHS): string {
  return addMonths(earnedOn, validityMonths);
}

/** The days on which the 14/3/1-day reminders are due. */
export function kummiesReminderDays(earnedOn: string, validityMonths = KUMMIES_VALIDITY_MONTHS): string[] {
  const until = kummiesValidUntil(earnedOn, validityMonths);
  return KUMMIES_REMINDER_DAYS_BEFORE.map((before) => addDays(until, -before));
}

// ---------- Balance (one lot per paid order, spent oldest first) ----------

export type KummiesLot = {
  id: string;
  /** Payment day (Bulgarian date) — validity starts here. */
  earnedOn: string;
  validUntil: string;
  amount: number;
  remaining: number;
};

export function newKummiesLot(id: string, paidAt: Date, amount: number): KummiesLot {
  const earnedOn = businessDay(paidAt);
  return { id, earnedOn, validUntil: kummiesValidUntil(earnedOn), amount, remaining: amount };
}

function isValid(lot: KummiesLot, today: string): boolean {
  return lot.remaining > 0 && lot.validUntil >= today;
}

/** Usable balance on `today` (expired lots do not count). */
export function kummiesBalance(lots: readonly KummiesLot[], today: string): number {
  return lots.filter((lot) => isValid(lot, today)).reduce((sum, lot) => sum + lot.remaining, 0);
}

/** The next expiry: how many points and on which day, or null when nothing is pending. */
export function nextKummiesExpiry(
  lots: readonly KummiesLot[],
  today: string,
): { count: number; validUntil: string } | null {
  const valid = lots.filter((lot) => isValid(lot, today));
  if (valid.length === 0) return null;
  const first = valid.reduce((a, b) => (a.validUntil <= b.validUntil ? a : b)).validUntil;
  const count = valid.filter((lot) => lot.validUntil === first).reduce((sum, lot) => sum + lot.remaining, 0);
  return { count, validUntil: first };
}

/**
 * Spends points from the lots that expire first, so the customer never loses points that could have
 * been used. Returns the updated lots, or null when the usable balance is too low.
 */
export function spendKummies(
  lots: readonly KummiesLot[],
  amount: number,
  today: string,
): KummiesLot[] | null {
  if (!Number.isInteger(amount) || amount <= 0) return null;
  if (kummiesBalance(lots, today) < amount) return null;
  const order = lots.toSorted((a, b) => a.validUntil.localeCompare(b.validUntil));
  let left = amount;
  const spent = new Map<string, number>();
  for (const lot of order) {
    if (left === 0) break;
    if (!isValid(lot, today)) continue;
    const take = Math.min(lot.remaining, left);
    spent.set(lot.id, take);
    left -= take;
  }
  return lots.map((lot) =>
    spent.has(lot.id) ? { ...lot, remaining: lot.remaining - (spent.get(lot.id) ?? 0) } : lot,
  );
}

export type Redemption = { lots: KummiesLot[]; creditCents: number };

/** Exchanges 100 Kummies for €5 credit. Returns null when the usable balance is too low. */
export function redeemKummies(lots: readonly KummiesLot[], today: string): Redemption | null {
  const updated = spendKummies(lots, KUMMIES_REDEEM_COST, today);
  return updated ? { lots: updated, creditCents: KUMMIES_REDEEM_CENTS } : null;
}

export type KummiesReminder = { daysBefore: KummiesReminderDay; count: number; validUntil: string };

/**
 * Reminders due on `today`: one per expiry day that is exactly 14, 3 or 1 day away and still has
 * unused points. The notification job (M3) sends them by e-mail and, if allowed, as an app push,
 * respecting quiet hours (22:00–08:00).
 */
export function kummiesRemindersDue(lots: readonly KummiesLot[], today: string): KummiesReminder[] {
  const reminders: KummiesReminder[] = [];
  for (const daysBefore of KUMMIES_REMINDER_DAYS_BEFORE) {
    const until = addDays(today, daysBefore);
    const count = lots
      .filter((lot) => lot.validUntil === until && isValid(lot, today))
      .reduce((sum, lot) => sum + lot.remaining, 0);
    if (count > 0) reminders.push({ daysBefore, count, validUntil: until });
  }
  return reminders;
}
