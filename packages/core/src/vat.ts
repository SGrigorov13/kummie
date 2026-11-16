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
 * The VAT contained in a consumer price (D-025: one price incl. VAT for every country, so the VAT
 * inside it depends on the destination). Rounded half-up to whole cents; the rate is turned into
 * basis points so the arithmetic stays in integers.
 *
 *   vat = gross − round(gross / (1 + rate))
 */
export function vatIncludedCents(grossCents: number, rate: number): number {
  assertCents(grossCents);
  const basisPoints = Math.round(rate * 10_000);
  const net = Math.round((grossCents * 10_000) / (10_000 + basisPoints));
  return grossCents - net;
}

/** The part of a consumer price that is not VAT. */
export function netOfVatCents(grossCents: number, rate: number): number {
  return grossCents - vatIncludedCents(grossCents, rate);
}
