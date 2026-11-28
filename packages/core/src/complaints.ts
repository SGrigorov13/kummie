/**
 * Complaints register (ЗЗП чл. 127; M2 item 12, D-064): every complaint gets a number from one
 * register, a one-month deadline and reminders before it. Pure functions; the API stores them.
 */
import { addDays, addMonths } from "./kummies";

/** What the customer asks for (ЗПЦСЦУ: bring the goods into conformity, or price reduction / refund). */
export const COMPLAINT_DEMANDS = ["repair", "replacement", "price_reduction", "refund"] as const;
export type ComplaintDemand = (typeof COMPLAINT_DEMANDS)[number];

/** Reminders to the shop this many days before the deadline (0 = on the last day). */
export const COMPLAINT_REMINDER_DAYS_BEFORE = [7, 1, 0] as const;

/** Register number shown to the customer and on the register: RK-0001. */
export function complaintNumber(seq: number): string {
  if (!Number.isInteger(seq) || seq < 1) throw new Error(`Invalid complaint number ${seq}`);
  return `RK-${String(seq).padStart(4, "0")}`;
}

/** The complaint must be settled within one month of the day it was received (ЗЗП). */
export function complaintDueOn(receivedDay: string): string {
  return addMonths(receivedDay, 1);
}

/** Which reminder (days before the deadline) falls on `today`, if any. */
export function complaintReminderDue(dueOn: string, today: string): number | null {
  return COMPLAINT_REMINDER_DAYS_BEFORE.find((days) => addDays(dueOn, -days) === today) ?? null;
}
