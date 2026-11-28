import { describe, expect, it } from "vitest";
import { addWorkingDays, kummiesAfterRefund, refundOfUnits, shortfalls } from "./shortages";

describe("missing and damaged units", () => {
  it("counts the supplier's working days, skipping the weekend", () => {
    expect(addWorkingDays("2026-11-30", 3)).toBe("2026-12-03"); // Monday → Thursday
    expect(addWorkingDays("2026-11-27", 3)).toBe("2026-12-02"); // Friday → Wednesday
    expect(addWorkingDays("2026-11-28", 1)).toBe("2026-11-30"); // Saturday → Monday
  });

  it("splits what a line did not get into damaged first, then missing", () => {
    const lines = [
      { id: "a", qty: 2, receivedQty: 0 },
      { id: "b", qty: 3, receivedQty: 3 },
      { id: "c", qty: 2, receivedQty: 1 },
    ];
    expect(shortfalls(lines, 1)).toEqual([
      { lineId: "a", kind: "damaged", qty: 1 },
      { lineId: "a", kind: "missing", qty: 1 },
      { lineId: "c", kind: "missing", qty: 1 },
    ]);
    expect(shortfalls(lines, 5)).toEqual([
      { lineId: "a", kind: "damaged", qty: 2 },
      { lineId: "c", kind: "damaged", qty: 1 },
    ]);
    expect(shortfalls([{ id: "x", qty: 1, receivedQty: 1 }], 0)).toEqual([]);
  });

  it("refunds the unit price and its share of the VAT", () => {
    const line = { qty: 3, unitPriceCents: 2499, vatCents: 1250 };
    expect(refundOfUnits(line, 1)).toEqual({ totalCents: 2499, vatCents: 417 });
    expect(refundOfUnits(line, 3)).toEqual({ totalCents: 7497, vatCents: 1250 });
    expect(() => refundOfUnits(line, 4)).toThrow();
    expect(() => refundOfUnits(line, 0)).toThrow();
  });

  it("re-counts the Kummies without the refunded goods (D-032)", () => {
    expect(kummiesAfterRefund(6000, 2000)).toBe(40);
    expect(kummiesAfterRefund(4000, 2000)).toBe(0); // below €30 → none
  });
});
