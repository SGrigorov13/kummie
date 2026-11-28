/**
 * Withdrawal from a distance sale (ЗЗП чл. 50–57; M2 item 11, D-064, D-070): 14 days after
 * delivery to say so, and the money back within 14 days of the request. Pure functions.
 */
import { addDays } from "./kummies";

/** Days after delivery in which the customer may withdraw without a reason. */
export const WITHDRAWAL_DAYS = 14;
/** Days after the request in which the money must be back (ЗЗП чл. 55). */
export const RETURN_REFUND_DAYS = 14;

/** Return number shown to the customer and written on the parcel: RET-0001. */
export function returnNumber(seq: number): string {
  if (!Number.isInteger(seq) || seq < 1) throw new Error(`Invalid return number ${seq}`);
  return `RET-${String(seq).padStart(4, "0")}`;
}

/** Last day (Sofia) the customer may still withdraw for goods delivered on `deliveredDay`. */
export function withdrawalUntil(deliveredDay: string): string {
  return addDays(deliveredDay, WITHDRAWAL_DAYS);
}

/** Last day the money must be back for a withdrawal requested on `requestedDay`. */
export function returnRefundDueOn(requestedDay: string): string {
  return addDays(requestedDay, RETURN_REFUND_DAYS);
}

/** Units of a line the customer can still send back: not refunded and not in an open return. */
export function returnableQty(line: { qty: number; refundedQty: number }, inOpenReturns: number): number {
  return Math.max(0, line.qty - line.refundedQty - inOpenReturns);
}
