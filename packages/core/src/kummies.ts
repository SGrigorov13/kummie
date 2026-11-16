import { assertCents } from "./vat";

/** Kummies are earned only when the goods in an order are worth at least €30.00 incl. VAT (D-027). */
export const KUMMIES_MIN_GOODS_CENTS = 3000;
/** 1 Kummie per whole euro of goods incl. VAT — easy to check by eye. */
export const KUMMIES_PER_EUR = 1;
/** Redemption: 500 Kummies buy €5 of store credit (open question in D-027 — see DECISIONS). */
export const KUMMIES_REDEEM_COST = 500;
export const KUMMIES_REDEEM_CENTS = 500;

/**
 * Kummies earned for the goods in an order (incl. VAT, before any Kummies discount). Shipping never
 * earns.
 */
export function kummiesEarned(goodsCents: number): number {
  assertCents(goodsCents);
  if (goodsCents < KUMMIES_MIN_GOODS_CENTS) return 0;
  return Math.floor((goodsCents * KUMMIES_PER_EUR) / 100);
}

export type Redemption = { balance: number; creditCents: number };

/** Exchanges one block of Kummies for store credit. Returns null when the balance is too low. */
export function redeemKummies(balance: number): Redemption | null {
  if (!Number.isInteger(balance) || balance < KUMMIES_REDEEM_COST) return null;
  return { balance: balance - KUMMIES_REDEEM_COST, creditCents: KUMMIES_REDEEM_CENTS };
}
