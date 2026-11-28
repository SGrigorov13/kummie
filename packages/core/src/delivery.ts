/**
 * Calculated delivery estimate (M2 item 14, D-064, D-071): the next batch closing of the chosen
 * supplier + the supplier's transit days to the hub + one working day to pack + the courier's days
 * to the country. Shown before payment (CLAUDE.md: delivery window visible before checkout).
 */
import { MAX_MINIMUM_WAIT_DAYS, nextBatchCloseAt, type BatchSchedule } from "./batches";
import { addDays, businessDay } from "./kummies";
import { addWorkingDays } from "./shortages";

export type DayRange = { min: number; max: number };
/** First and last day (Sofia, ISO dates) the parcel is expected at the customer's. */
export type DeliveryWindow = { from: string; to: string };

/** Working days at the hub between the batch arriving and the parcel leaving. */
export const HUB_HANDLING_WORKING_DAYS = 1;

export function estimateDelivery(input: {
  now: Date;
  schedule: BatchSchedule;
  /** Working days from the batch closing until it reaches the hub. */
  transitDays: DayRange;
  /** Working days the courier needs to the customer's country. */
  courierDays: DayRange;
  /** The supplier has a minimum order: the batch may wait up to 7 more days (D-063 B2). */
  minimumOrder: boolean;
}): DeliveryWindow {
  const closeDay = businessDay(nextBatchCloseAt(input.now, input.schedule));
  const latestClose = input.minimumOrder ? addDays(closeDay, MAX_MINIMUM_WAIT_DAYS) : closeDay;
  const from = addWorkingDays(addWorkingDays(closeDay, input.transitDays.min), input.courierDays.min);
  const to = addWorkingDays(
    addWorkingDays(latestClose, input.transitDays.max + HUB_HANDLING_WORKING_DAYS),
    input.courierDays.max,
  );
  return { from, to: to < from ? from : to };
}

/** The whole order arrives together: the latest of its lines. */
export function latestWindow(windows: readonly (DeliveryWindow | null)[]): DeliveryWindow | null {
  const known = windows.filter((w): w is DeliveryWindow => w !== null);
  if (known.length === 0) return null;
  return {
    from: known.reduce((a, w) => (w.from > a ? w.from : a), known[0]?.from ?? ""),
    to: known.reduce((a, w) => (w.to > a ? w.to : a), known[0]?.to ?? ""),
  };
}

const parts = (iso: string, locale: "bg" | "en") => {
  const date = new Date(`${iso}T12:00:00Z`);
  const month = new Intl.DateTimeFormat(locale === "bg" ? "bg-BG" : "en-GB", {
    month: "long",
    timeZone: "UTC",
  }).format(date);
  return { day: date.getUTCDate(), month };
};

/** "3–7 декември", "28 ноември – 3 декември" (en: "3–7 December"). */
export function formatDeliveryWindow(window: DeliveryWindow, locale: "bg" | "en"): string {
  const a = parts(window.from, locale);
  const b = parts(window.to, locale);
  if (window.from === window.to) return `${a.day} ${a.month}`;
  if (a.month === b.month && window.from.slice(0, 4) === window.to.slice(0, 4))
    return `${a.day}–${b.day} ${b.month}`;
  return `${a.day} ${a.month} – ${b.day} ${b.month}`;
}
