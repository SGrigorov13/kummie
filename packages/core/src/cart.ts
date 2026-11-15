import { kummiesEarned } from "./kummies";
import type { Country } from "./types";
import { assertCents, vatCents, vatRate } from "./vat";

/** Free shipping from €79.99 incl. VAT (D-007). */
export const FREE_SHIPPING_GROSS_CENTS = 7999;
/** Flat shipping fee below the threshold. */
export const SHIPPING_FEE_CENTS = 490;

/** Countries we deliver to at launch. Poland follows about a month later. */
export const SHIPPING_COUNTRIES = ["BG", "RO", "GR"] as const satisfies readonly Country[];
export type ShippingCountry = (typeof SHIPPING_COUNTRIES)[number];

export type CartLineInput = { priceExVatCents: number; qty: number };

export type Quote = {
  exVatCents: number;
  vatCents: number;
  vatRate: number;
  /** Merchandise incl. VAT. */
  grossCents: number;
  shippingCents: number;
  /** Store credit actually applied; never more than goods + shipping. */
  creditCents: number;
  totalCents: number;
  /** Kummies this order would earn. */
  kummies: number;
};

/** Shipping for a merchandise value incl. VAT. An empty cart ships nothing. */
export function shippingCents(merchandiseGrossCents: number): number {
  assertCents(merchandiseGrossCents);
  if (merchandiseGrossCents <= 0) return 0;
  return merchandiseGrossCents >= FREE_SHIPPING_GROSS_CENTS ? 0 : SHIPPING_FEE_CENTS;
}

/**
 * Prices a cart for a destination country. VAT is rounded per unit, so the cart total always equals
 * the sum of the gross prices shown on product cards (D-016).
 */
export function quoteCart(
  lines: readonly CartLineInput[],
  country: Country,
  availableCreditCents = 0,
  date: Date = new Date(),
): Quote {
  assertCents(availableCreditCents);
  const rate = vatRate(country, date);
  let exVat = 0;
  let vat = 0;
  for (const line of lines) {
    assertCents(line.priceExVatCents);
    if (!Number.isInteger(line.qty) || line.qty < 0) throw new Error(`Invalid quantity ${line.qty}`);
    exVat += line.priceExVatCents * line.qty;
    vat += vatCents(line.priceExVatCents, rate) * line.qty;
  }
  const gross = exVat + vat;
  const shipping = shippingCents(gross);
  const credit = Math.min(Math.max(availableCreditCents, 0), gross + shipping);
  return {
    exVatCents: exVat,
    vatCents: vat,
    vatRate: rate,
    grossCents: gross,
    shippingCents: shipping,
    creditCents: credit,
    totalCents: gross + shipping - credit,
    kummies: kummiesEarned(exVat),
  };
}
