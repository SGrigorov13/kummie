import { describe, expect, it } from "vitest";
import { quoteCart, shippingCents, splitCents, vatCountryFor } from "./cart";

const NOV_2026 = new Date("2026-11-16T10:00:00Z");

describe("vatCountryFor (A12: Bulgarian VAT until OSS is active)", () => {
  it("uses BG before the OSS date or when none is set", () => {
    expect(vatCountryFor("RO", "2026-11-16", null)).toBe("BG");
    expect(vatCountryFor("GR", "2026-11-16", "2026-12-01")).toBe("BG");
  });

  it("uses the destination from the OSS date on", () => {
    expect(vatCountryFor("GR", "2026-12-01", "2026-12-01")).toBe("GR");
    expect(vatCountryFor("RO", "2027-01-05", "2026-12-01")).toBe("RO");
    expect(vatCountryFor("BG", "2027-01-05", "2026-12-01")).toBe("BG");
  });

  it("changes only the VAT inside the same total", () => {
    const lines = [{ priceCents: 2990, qty: 2 }];
    const beforeOss = quoteCart(lines, "GR", 0, NOV_2026, { vatCountry: "BG" });
    const afterOss = quoteCart(lines, "GR", 0, NOV_2026);
    expect(beforeOss.totalCents).toBe(afterOss.totalCents);
    expect(beforeOss.vatRate).toBe(0.2);
    expect(afterOss.vatRate).toBe(0.24);
  });
});

describe("delivery fee per country (A5)", () => {
  it("uses the configured fee below the free-delivery threshold", () => {
    expect(shippingCents(5000, 590)).toBe(590);
    expect(shippingCents(8000, 590)).toBe(0);
    const quote = quoteCart([{ priceCents: 5000, qty: 1 }], "RO", 0, NOV_2026, { shippingFeeCents: 690 });
    expect(quote.shippingCents).toBe(690);
    expect(quote.totalCents).toBe(5690);
  });
});

describe("splitCents", () => {
  it("adds up exactly and follows the proportions", () => {
    expect(splitCents(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(splitCents(815, [2990, 1990, 0])).toEqual([489, 326, 0]);
    const parts = [1299, 2599, 490];
    expect(splitCents(731, parts).reduce((a, b) => a + b, 0)).toBe(731);
  });

  it("handles empty and zero inputs", () => {
    expect(splitCents(0, [10, 20])).toEqual([0, 0]);
    expect(splitCents(5, [])).toEqual([]);
    expect(splitCents(5, [0, 0])).toEqual([5, 0]);
  });
});
