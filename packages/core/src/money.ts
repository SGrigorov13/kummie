import type { Locale } from "./types";
import { assertCents } from "./vat";

/**
 * Bulgaria's mandatory lev/euro dual display ended on 8 Aug 2026 (D-004).
 * BGN is available behind this flag only.
 */
export const SHOW_BGN = false;

/** Fixed lev peg. */
export const BGN_PER_EUR = 1.95583;

const intlLocale: Record<Locale, string> = { bg: "bg-BG", en: "en-GB" };

/** Formats integer euro cents as EUR, e.g. 2200 → "22,00 €" (bg) / "€22.00" (en). */
export function formatMoney(cents: number, locale: Locale): string {
  assertCents(cents);
  return new Intl.NumberFormat(intlLocale[locale], { style: "currency", currency: "EUR" }).format(
    cents / 100,
  );
}

/** Reference BGN amount for integer euro cents. Show only when `SHOW_BGN` is on. */
export function formatBgn(cents: number, locale: Locale): string {
  assertCents(cents);
  const stotinki = Math.round(cents * BGN_PER_EUR);
  return new Intl.NumberFormat(intlLocale[locale], { style: "currency", currency: "BGN" }).format(
    stotinki / 100,
  );
}

/** Parses a typed euro amount ("40", "12,50", "12.5") into cents. */
export function parseEuroToCents(input: string): number | undefined {
  const normalised = input.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalised)) return undefined;
  const [whole = "0", fraction = ""] = normalised.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}
