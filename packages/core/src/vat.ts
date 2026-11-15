import type { Country } from "./types";

export type VatRateEntry = {
  country: Country;
  /** Standard rate as a fraction, e.g. 0.2 for 20 %. */
  rate: number;
  /** ISO date (YYYY-MM-DD) from which the rate applies. */
  validFrom: string;
};

/**
 * Standard VAT rates by destination country (OSS distance sales, ARCHITECTURE §6).
 * Dated, so a rate change is a new row and never an edit of history.
 */
export const VAT_RATES: readonly VatRateEntry[] = [
  { country: "BG", rate: 0.2, validFrom: "2007-01-01" },
  { country: "RO", rate: 0.19, validFrom: "2017-01-01" },
  { country: "RO", rate: 0.21, validFrom: "2025-08-01" },
  { country: "GR", rate: 0.24, validFrom: "2016-06-01" },
  { country: "PL", rate: 0.23, validFrom: "2011-01-01" },
];

export function assertCents(value: number): void {
  if (!Number.isInteger(value)) throw new Error(`Money must be integer cents, got ${value}`);
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The standard VAT rate for `country` on `date` (defaults to today). */
export function vatRate(country: Country, date: Date = new Date()): number {
  const day = isoDay(date);
  let best: VatRateEntry | undefined;
  for (const entry of VAT_RATES) {
    if (entry.country !== country || entry.validFrom > day) continue;
    if (!best || entry.validFrom > best.validFrom) best = entry;
  }
  if (!best) throw new Error(`No VAT rate for ${country} on ${day}`);
  return best.rate;
}

/**
 * VAT on one unit, rounded half-up to whole cents. The rate is turned into basis points first so
 * the multiplication stays in integers.
 */
export function vatCents(exVatCents: number, rate: number): number {
  assertCents(exVatCents);
  const basisPoints = Math.round(rate * 10_000);
  return Math.round((exVatCents * basisPoints) / 10_000);
}

/** Price incl. VAT for one unit. */
export function grossCents(exVatCents: number, rate: number): number {
  return exVatCents + vatCents(exVatCents, rate);
}

/** Price incl. VAT for one unit in a destination country. */
export function unitGrossCents(exVatCents: number, country: Country, date: Date = new Date()): number {
  return grossCents(exVatCents, vatRate(country, date));
}
