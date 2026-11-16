import { kummiesBaseCents, kummiesEarned } from "./kummies";
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
  /** Goods incl. VAT after the discount, without delivery — what Kummies are counted on. */
  kummiesBaseCents: number;
  /** Kummies this order would earn. */
  kummies: number;
};

/** Delivery for a goods value incl. VAT. An empty cart ships nothing. */
export function shippingCents(goodsCents: number, feeCents: number = SHIPPING_FEE_CENTS): number {
  assertCents(goodsCents);
  assertCents(feeCents);
  if (goodsCents <= 0) return 0;
  return goodsCents >= FREE_SHIPPING_FROM_CENTS ? 0 : feeCents;
}

/**
 * Which country's VAT applies to a sale (A12). Until the voluntary OSS registration is active, every
 * sale carries Bulgarian VAT; from the OSS date on, the destination country's rate applies.
 */
export function vatCountryFor(
  destination: Country,
  saleDay: string,
  ossEffectiveFrom: string | null,
): Country {
  if (destination === "BG") return "BG";
  return ossEffectiveFrom && saleDay >= ossEffectiveFrom ? destination : "BG";
}

/** Extra pricing inputs that come from settings rather than the cart. */
export type QuoteOptions = {
  /** Delivery fee for the destination (admin setting, A5). Default €4.90. */
  shippingFeeCents?: number;
  /** Country whose VAT rate applies (see `vatCountryFor`). Default: the destination. */
  vatCountry?: Country;
};

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
  options: QuoteOptions = {},
): Quote {
  assertCents(availableCreditCents);
  let goods = 0;
  for (const line of lines) {
    assertCents(line.priceCents);
    if (!Number.isInteger(line.qty) || line.qty < 0) throw new Error(`Invalid quantity ${line.qty}`);
    goods += line.priceCents * line.qty;
  }
  const shipping = shippingCents(goods, options.shippingFeeCents);
  const credit = Math.min(Math.max(availableCreditCents, 0), goods + shipping);
  const total = goods + shipping - credit;
  const rate = vatRate(options.vatCountry ?? country, date);
  const vat = vatIncludedCents(total, rate);
  return {
    goodsCents: goods,
    shippingCents: shipping,
    creditCents: credit,
    totalCents: total,
    vatRate: rate,
    vatCents: vat,
    netCents: total - vat,
    kummiesBaseCents: kummiesBaseCents(goods, credit),
    kummies: kummiesEarned(kummiesBaseCents(goods, credit)),
  };
}

/**
 * Splits an amount (e.g. the VAT of an order) over parts in proportion to their sizes so that the
 * pieces add up exactly (largest remainder; ties go to the earlier part). Used to show VAT per order
 * line while the order keeps one authoritative VAT figure (D-016).
 */
export function splitCents(totalCents: number, parts: readonly number[]): number[] {
  assertCents(totalCents);
  if (parts.length === 0) return [];
  const sum = parts.reduce((a, b) => a + b, 0);
  if (sum <= 0) return parts.map((_, i) => (i === 0 ? totalCents : 0));
  const exact = parts.map((p) => (totalCents * p) / sum);
  const result = exact.map((value) => Math.floor(value));
  let left = totalCents - result.reduce((a, b) => a + b, 0);
  const byRest = exact
    .map((value, index) => ({ index, rest: value - Math.floor(value) }))
    .toSorted((a, b) => b.rest - a.rest || a.index - b.index);
  for (const { index } of byRest) {
    if (left <= 0) break;
    result[index] = (result[index] ?? 0) + 1;
    left -= 1;
  }
  return result;
}
