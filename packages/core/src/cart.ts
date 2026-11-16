import { kummiesEarned } from "./kummies";
import type { Country } from "./types";
import { assertCents, vatIncludedCents, vatRate } from "./vat";

/**
 * Free delivery when the goods incl. VAT are worth MORE than €79.99, i.e. from €80.00 (D-026).
 */
export const FREE_SHIPPING_FROM_CENTS = 8000;
/** Flat delivery fee below the threshold, incl. VAT. */
export const SHIPPING_FEE_CENTS = 490;

/** Countries we deliver to at launch. Poland follows about a month later. */
export const SHIPPING_COUNTRIES = ["BG", "RO", "GR"] as const satisfies readonly Country[];
export type ShippingCountry = (typeof SHIPPING_COUNTRIES)[number];

/** One cart line: the consumer price incl. VAT (same in every country) and a quantity. */
export type CartLineInput = { priceCents: number; qty: number };

export type Quote = {
  /** Goods incl. VAT — exactly the sum of the prices shown on the product cards. */
  goodsCents: number;
  shippingCents: number;
  /** Store credit actually applied; never more than goods + shipping. */
  creditCents: number;
  /** What the customer pays. Identical in BG, RO and GR for the same cart. */
  totalCents: number;
  /** Destination-country rate used to work out the VAT inside the total. */
  vatRate: number;
  /** VAT contained in `totalCents` (goods and delivery are both standard-rated). */
  vatCents: number;
  /** `totalCents` without VAT: what KUMMIE keeps before costs. Varies by country. */
  netCents: number;
  /** Kummies this order would earn. */
  kummies: number;
};

/** Delivery for a goods value incl. VAT. An empty cart ships nothing. */
export function shippingCents(goodsCents: number): number {
  assertCents(goodsCents);
  if (goodsCents <= 0) return 0;
  return goodsCents >= FREE_SHIPPING_FROM_CENTS ? 0 : SHIPPING_FEE_CENTS;
}

/**
 * Prices a cart. The customer pays the same total in every country (D-025); only the VAT inside it
 * changes with the destination, so KUMMIE's net (`netCents`) is what moves. VAT is worked out once,
 * on the amount actually paid, so a Kummies discount also lowers the VAT (D-016).
 */
export function quoteCart(
  lines: readonly CartLineInput[],
  country: Country,
  availableCreditCents = 0,
  date: Date = new Date(),
): Quote {
  assertCents(availableCreditCents);
  let goods = 0;
  for (const line of lines) {
    assertCents(line.priceCents);
    if (!Number.isInteger(line.qty) || line.qty < 0) throw new Error(`Invalid quantity ${line.qty}`);
    goods += line.priceCents * line.qty;
  }
  const shipping = shippingCents(goods);
  const credit = Math.min(Math.max(availableCreditCents, 0), goods + shipping);
  const total = goods + shipping - credit;
  const rate = vatRate(country, date);
  const vat = vatIncludedCents(total, rate);
  return {
    goodsCents: goods,
    shippingCents: shipping,
    creditCents: credit,
    totalCents: total,
    vatRate: rate,
    vatCents: vat,
    netCents: total - vat,
    kummies: kummiesEarned(goods),
  };
}
