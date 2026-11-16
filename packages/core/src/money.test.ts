import { describe, expect, it } from "vitest";
import { FREE_SHIPPING_FROM_CENTS, SHIPPING_FEE_CENTS, quoteCart, shippingCents } from "./cart";
import { KUMMIES_REDEEM_COST, kummiesEarned, redeemKummies } from "./kummies";
import { formatBgn, formatMoney, parseEuroToCents, SHOW_BGN } from "./money";
import { netOfVatCents, vatIncludedCents, vatRate } from "./vat";

const NOV_2026 = new Date("2026-11-16T12:00:00Z");

describe("VAT per destination country", () => {
  it("uses the standard rate of each country (checked against EU TEDB on 2026-11-16)", () => {
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
});

describe("one consumer price everywhere (D-025)", () => {
  it("extracts the VAT contained in a price, per country", () => {
    // €18.00 on the shelf in every country.
    expect(vatIncludedCents(1800, 0.2)).toBe(300); // BG: 15.00 + 3.00
    expect(vatIncludedCents(1800, 0.21)).toBe(312); // RO: 14.88 + 3.12
    expect(vatIncludedCents(1800, 0.24)).toBe(348); // GR: 14.52 + 3.48
    expect(netOfVatCents(1800, 0.24)).toBe(1452);
  });

  it("charges the same total in BG, RO and GR; only VAT and net differ", () => {
    const lines = [{ priceCents: 2200, qty: 2 }];
    const bg = quoteCart(lines, "BG", 0, NOV_2026);
    const ro = quoteCart(lines, "RO", 0, NOV_2026);
    const gr = quoteCart(lines, "GR", 0, NOV_2026);
    expect(bg.totalCents).toBe(4400 + 490);
    expect(ro.totalCents).toBe(bg.totalCents);
    expect(gr.totalCents).toBe(bg.totalCents);
    expect(bg.vatCents).toBe(815); // 4890 / 1.20 = 4075 net
    expect(ro.vatCents).toBe(849); // 4890 / 1.21 = 4041 net
    expect(gr.vatCents).toBe(946); // 4890 / 1.24 = 3944 net
    expect(gr.netCents).toBeLessThan(bg.netCents);
    for (const quote of [bg, ro, gr]) expect(quote.netCents + quote.vatCents).toBe(quote.totalCents);
  });

  it("makes the goods line exactly the sum of the shown prices", () => {
    const quote = quoteCart(
      [
        { priceCents: 2200, qty: 3 },
        { priceCents: 750, qty: 1 },
      ],
      "RO",
      0,
      NOV_2026,
    );
    expect(quote.goodsCents).toBe(3 * 2200 + 750);
  });

  it("rounds the VAT half-up to whole cents", () => {
    expect(vatIncludedCents(1, 0.2)).toBe(0); // net 0.83 → 1 cent net
    expect(vatIncludedCents(6, 0.2)).toBe(1); // net 5
    expect(vatIncludedCents(100, 0.21)).toBe(17); // net 82.64 → 83
  });

  it("rejects non-integer money", () => {
    expect(() => vatIncludedCents(18.5, 0.2)).toThrow();
    expect(() => quoteCart([{ priceCents: 9.99, qty: 1 }], "BG")).toThrow();
    expect(() => formatMoney(1.5, "en")).toThrow();
  });
});

describe("free delivery when goods are worth more than €79.99 (D-026)", () => {
  it("charges delivery at €79.99 and is free from €80.00", () => {
    expect(FREE_SHIPPING_FROM_CENTS).toBe(8000);
    expect(shippingCents(7999)).toBe(SHIPPING_FEE_CENTS);
    expect(shippingCents(8000)).toBe(0);
    expect(shippingCents(12000)).toBe(0);
  });

  it("applies the threshold to the goods in the cart, not to the total after a discount", () => {
    expect(quoteCart([{ priceCents: 7999, qty: 1 }], "BG", 0, NOV_2026).shippingCents).toBe(490);
    const discounted = quoteCart([{ priceCents: 8000, qty: 1 }], "BG", 1000, NOV_2026);
    expect(discounted.shippingCents).toBe(0);
    expect(discounted.totalCents).toBe(7000);
  });

  it("ships nothing for an empty cart", () => {
    const quote = quoteCart([], "BG", 0, NOV_2026);
    expect(quote.shippingCents).toBe(0);
    expect(quote.totalCents).toBe(0);
  });
});

describe("Kummies (D-027)", () => {
  it("earns nothing below €30.00 of goods incl. VAT", () => {
    expect(kummiesEarned(2999)).toBe(0);
  });

  it("earns 1 Kummie per whole euro from €30.00", () => {
    expect(kummiesEarned(3000)).toBe(30);
    expect(kummiesEarned(4599)).toBe(45);
    expect(kummiesEarned(10000)).toBe(100);
  });

  it("counts goods only — delivery never earns", () => {
    expect(quoteCart([{ priceCents: 2999, qty: 1 }], "GR", 0, NOV_2026).kummies).toBe(0);
    expect(quoteCart([{ priceCents: 3000, qty: 1 }], "GR", 0, NOV_2026).kummies).toBe(30);
  });

  it("redeems 500 Kummies for €5 credit", () => {
    expect(redeemKummies(499)).toBeNull();
    expect(redeemKummies(KUMMIES_REDEEM_COST)).toEqual({ balance: 0, creditCents: 500 });
    expect(redeemKummies(1234)).toEqual({ balance: 734, creditCents: 500 });
  });
});

describe("store credit", () => {
  it("is subtracted from the total and lowers the VAT", () => {
    const quote = quoteCart([{ priceCents: 3000, qty: 1 }], "BG", 500, NOV_2026);
    expect(quote.totalCents).toBe(3000 + 490 - 500);
    expect(quote.vatCents).toBe(vatIncludedCents(2990, 0.2));
  });

  it("never exceeds goods plus delivery", () => {
    const quote = quoteCart([{ priceCents: 500, qty: 1 }], "BG", 5000, NOV_2026);
    expect(quote.creditCents).toBe(500 + 490);
    expect(quote.totalCents).toBe(0);
    expect(quote.vatCents).toBe(0);
  });

  it("ignores negative credit", () => {
    expect(quoteCart([{ priceCents: 1000, qty: 1 }], "BG", -300, NOV_2026).creditCents).toBe(0);
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
