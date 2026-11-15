import type { Country, Quote } from "./types.ts";

export const COUNTRIES: Country[] = ["BG", "RO", "GR"];

export const VAT_RATE: Record<Country, number> = {
  BG: 0.2,
  RO: 0.19,
  GR: 0.24,
};

/** Bulgarian lev peg, shown as a reference next to EUR. */
export const BGN_PER_EUR = 1.95583;

/** Demo setting until a real free-shipping threshold is chosen. */
export const FREE_SHIPPING_GROSS = 60;
export const SHIPPING_EUR = 4.9;

/** Earn points only when merchandise ex-VAT reaches this amount. */
export const KUMMIES_MIN_EX_VAT = 15;
export const KUMMIES_PER_EUR = 10;
export const KUMMIES_REDEEM_COST = 500;
export const KUMMIES_REDEEM_EUR = 5;

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function quoteCart(
  exVat: number,
  country: Country,
  creditEur: number,
): Quote {
  const vatRate = VAT_RATE[country];
  const vat = roundMoney(exVat * vatRate);
  const gross = roundMoney(exVat + vat);
  const shipping = exVat <= 0 || gross >= FREE_SHIPPING_GROSS ? 0 : SHIPPING_EUR;
  const credit = roundMoney(Math.min(Math.max(creditEur, 0), gross + shipping));
  const total = roundMoney(Math.max(0, gross + shipping - credit));
  const points = exVat >= KUMMIES_MIN_EX_VAT ? Math.floor(exVat * KUMMIES_PER_EUR) : 0;
  return { exVat: roundMoney(exVat), vat, vatRate, gross, shipping, credit, total, points };
}

export function formatMoney(amount: number, currency: "EUR" | "BGN", locale: "bg" | "en"): string {
  return new Intl.NumberFormat(locale === "bg" ? "bg-BG" : "en-GB", {
    style: "currency",
    currency,
  }).format(amount);
}
