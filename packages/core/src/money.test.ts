import { describe, expect, it } from "vitest";
import {
  FREE_SHIPPING_GROSS_CENTS,
  SHIPPING_FEE_CENTS,
  quoteCart,
  shippingCents,
} from "./cart";
import { KUMMIES_REDEEM_COST, kummiesEarned, redeemKummies } from "./kummies";
import { formatBgn, formatMoney, parseEuroToCents, SHOW_BGN } from "./money";
import { grossCents, unitGrossCents, vatCents, vatRate } from "./vat";

const NOV_2026 = new Date("2026-11-16T12:00:00Z");

describe("VAT per destination country", () => {
  it("uses the standard rate of each launch country", () => {
    expect(vatRate("BG", NOV_2026)).toBe(0.2);
    expect(vatRate("RO", NOV_2026)).toBe(0.21);
    expect(vatRate("GR", NOV_2026)).toBe(0.24);
    expect(vatRate("PL", NOV_2026)).toBe(0.23);
  });

  it("picks the rate valid on the given date", () => {
    expect(vatRate("RO", new Date("2025-07-31T12:00:00Z"))).toBe(0.19);
    expect(vatRate("RO", new Date("2025-08-01T00:00:00Z"))).toBe(0.21);
  });

  it("throws before any rate exists", () => {
    expect(() => vatRate("BG", new Date("1990-01-01T00:00:00Z"))).toThrow();
  });

  it("prices one unit incl. VAT per country", () => {
    expect(unitGrossCents(1000, "BG", NOV_2026)).toBe(1200);
    expect(unitGrossCents(1000, "RO", NOV_2026)).toBe(1210);
    expect(unitGrossCents(1000, "GR", NOV_2026)).toBe(1240);
  });
});

describe("rounding", () => {
  it("rounds VAT half-up to whole cents", () => {
    expect(vatCents(1833, 0.2)).toBe(367); // 366.6
    expect(vatCents(1832, 0.2)).toBe(366); // 366.4
    expect(vatCents(1, 0.21)).toBe(0); // 0.21
    expect(vatCents(5, 0.1)).toBe(1); // 0.5 rounds up
    expect(grossCents(1833, 0.2)).toBe(2200);
  });

  it("rounds per unit, so the cart equals the sum of shown unit prices", () => {
    const quote = quoteCart([{ priceExVatCents: 1833, qty: 3 }], "BG", 0, NOV_2026);
    expect(quote.grossCents).toBe(3 * unitGrossCents(1833, "BG", NOV_2026));
    expect(quote.vatCents).toBe(3 * 367);
  });

  it("rejects non-integer money", () => {
    expect(() => vatCents(18.33, 0.2)).toThrow();
    expect(() => quoteCart([{ priceExVatCents: 9.99, qty: 1 }], "BG")).toThrow();
    expect(() => formatMoney(1.5, "en")).toThrow();
  });
});

describe("shipping threshold (€79.99 incl. VAT)", () => {
  it("charges the fee at €79.98 and ships free at €79.99", () => {
    expect(FREE_SHIPPING_GROSS_CENTS).toBe(7999);
    expect(shippingCents(7998)).toBe(SHIPPING_FEE_CENTS);
    expect(shippingCents(7999)).toBe(0);
    expect(shippingCents(8000)).toBe(0);
  });

  it("applies the threshold to the cart gross", () => {
    // 6665 ex-VAT → 1333 VAT → 7998 gross; 6666 → 1333 → 7999.
    expect(quoteCart([{ priceExVatCents: 6665, qty: 1 }], "BG", 0, NOV_2026).shippingCents).toBe(490);
    expect(quoteCart([{ priceExVatCents: 6666, qty: 1 }], "BG", 0, NOV_2026).shippingCents).toBe(0);
  });

  it("ships nothing for an empty cart", () => {
    const quote = quoteCart([], "BG", 0, NOV_2026);
    expect(quote.shippingCents).toBe(0);
    expect(quote.totalCents).toBe(0);
  });
});

describe("Kummies", () => {
  it("earns nothing below €15.00 ex-VAT", () => {
    expect(kummiesEarned(1499)).toBe(0);
  });

  it("earns 10 per euro from €15.00 ex-VAT", () => {
    expect(kummiesEarned(1500)).toBe(150);
    expect(kummiesEarned(1555)).toBe(155);
    expect(kummiesEarned(1559)).toBe(155);
  });

  it("uses the cart's merchandise ex-VAT, not the gross or shipping", () => {
    expect(quoteCart([{ priceExVatCents: 1499, qty: 1 }], "GR", 0, NOV_2026).kummies).toBe(0);
    expect(quoteCart([{ priceExVatCents: 1500, qty: 1 }], "GR", 0, NOV_2026).kummies).toBe(150);
  });

  it("redeems 500 Kummies for €5 credit", () => {
    expect(redeemKummies(499)).toBeNull();
    expect(redeemKummies(KUMMIES_REDEEM_COST)).toEqual({ balance: 0, creditCents: 500 });
    expect(redeemKummies(1234)).toEqual({ balance: 734, creditCents: 500 });
  });
});

describe("store credit", () => {
  it("is subtracted from the total", () => {
    const quote = quoteCart([{ priceExVatCents: 2500, qty: 1 }], "BG", 500, NOV_2026);
    expect(quote.grossCents).toBe(3000);
    expect(quote.shippingCents).toBe(490);
    expect(quote.creditCents).toBe(500);
    expect(quote.totalCents).toBe(2990);
  });

  it("never exceeds goods plus shipping", () => {
    const quote = quoteCart([{ priceExVatCents: 417, qty: 1 }], "BG", 5000, NOV_2026);
    expect(quote.creditCents).toBe(500 + 490);
    expect(quote.totalCents).toBe(0);
  });

  it("ignores negative credit", () => {
    const quote = quoteCart([{ priceExVatCents: 1000, qty: 1 }], "BG", -300, NOV_2026);
    expect(quote.creditCents).toBe(0);
  });
});

describe("formatting", () => {
  it("formats cents as EUR per locale", () => {
    expect(formatMoney(2200, "en")).toBe("€22.00");
    expect(formatMoney(2200, "bg").replace(/\s/g, " ")).toBe("22,00 €");
  });

  it("keeps BGN behind a flag that is off", () => {
    expect(SHOW_BGN).toBe(false);
    expect(formatBgn(1000, "en")).toContain("19.56");
  });

  it("parses typed euro amounts into cents", () => {
    expect(parseEuroToCents("40")).toBe(4000);
    expect(parseEuroToCents("12,5")).toBe(1250);
    expect(parseEuroToCents("12.05")).toBe(1205);
    expect(parseEuroToCents("abc")).toBeUndefined();
  });
});
