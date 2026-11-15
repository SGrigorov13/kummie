import { assertCents } from "./vat";

/** Kummies are earned only when merchandise ex-VAT reaches €15.00 (D-002). */
export const KUMMIES_MIN_EX_VAT_CENTS = 1500;
/** 10 Kummies per €1 of merchandise ex-VAT. */
export const KUMMIES_PER_EUR = 10;
/** 500 Kummies buy €5 of store credit. */
export const KUMMIES_REDEEM_COST = 500;
export const KUMMIES_REDEEM_CENTS = 500;

/** Kummies earned for an order's merchandise value ex-VAT. Shipping never earns. */
export function kummiesEarned(merchandiseExVatCents: number): number {
  assertCents(merchandiseExVatCents);
  if (merchandiseExVatCents < KUMMIES_MIN_EX_VAT_CENTS) return 0;
  return Math.floor((merchandiseExVatCents * KUMMIES_PER_EUR) / 100);
}

export type Redemption = { balance: number; creditCents: number };

/** Exchanges one block of 500 Kummies for €5 credit. Returns null when the balance is too low. */
export function redeemKummies(balance: number): Redemption | null {
  if (!Number.isInteger(balance) || balance < KUMMIES_REDEEM_COST) return null;
  return { balance: balance - KUMMIES_REDEEM_COST, creditCents: KUMMIES_REDEEM_CENTS };
}
