import { describe, expect, it } from "vitest";
import {
  allocateLandedCost,
  consolidateLines,
  nextBatchCloseAt,
  purchaseOrderCsv,
  purchaseOrderTotalCents,
  sofiaTime,
} from "./batches";

describe("nextBatchCloseAt", () => {
  it("closes Monday, Wednesday and Friday at 12:00 Sofia time", () => {
    // Tuesday 2026-11-24 09:00 UTC (11:00 Sofia, winter time UTC+2) → Wednesday 12:00 Sofia.
    expect(nextBatchCloseAt(new Date("2026-11-24T09:00:00Z")).toISOString()).toBe("2026-11-25T10:00:00.000Z");
    // Exactly at closing time → the next one (Friday).
    expect(nextBatchCloseAt(new Date("2026-11-25T10:00:00Z")).toISOString()).toBe("2026-11-27T10:00:00.000Z");
    // Friday afternoon → Monday.
    expect(nextBatchCloseAt(new Date("2026-11-27T15:00:00Z")).toISOString()).toBe("2026-11-30T10:00:00.000Z");
  });

  it("follows summer time", () => {
    expect(sofiaTime(2027, 7, 5, 12).toISOString()).toBe("2027-07-05T09:00:00.000Z");
    // Saturday before the switch to summer time (28 March 2027) → Monday 12:00 at UTC+3.
    expect(nextBatchCloseAt(new Date("2027-03-27T12:00:00Z")).toISOString()).toBe("2027-03-29T09:00:00.000Z");
  });

  it("takes a custom schedule", () => {
    expect(
      nextBatchCloseAt(new Date("2026-11-24T09:00:00Z"), { weekdays: [2], hour: 18 }).toISOString(),
    ).toBe("2026-11-24T16:00:00.000Z");
    expect(() => nextBatchCloseAt(new Date(), { weekdays: [], hour: 12 })).toThrow();
  });
});

describe("purchase orders", () => {
  const lines = [
    { supplierSku: "KM-ALB-B", description: "Album, Ver. B", quantity: 2, unitCostCents: 1250 },
    { supplierSku: "KM-ALB-A", description: "Album, Ver. A", quantity: 1, unitCostCents: 1250 },
    { supplierSku: "KM-ALB-B", description: "Album, Ver. B", quantity: 1, unitCostCents: 1250 },
    { supplierSku: "KM-STICK", description: 'Lightstick case, "pink"', quantity: 1, unitCostCents: 900 },
  ];

  it("joins the same SKU from many orders into one line", () => {
    const merged = consolidateLines(lines);
    expect(merged.map((l) => [l.supplierSku, l.quantity])).toEqual([
      ["KM-ALB-A", 1],
      ["KM-ALB-B", 3],
      ["KM-STICK", 1],
    ]);
    expect(purchaseOrderTotalCents(merged)).toBe(5900);
    expect(() =>
      consolidateLines([...lines, { ...lines[0], unitCostCents: 1300 } as (typeof lines)[number]]),
    ).toThrow(/Two costs/);
  });

  it("writes the CSV for the supplier", () => {
    const csv = purchaseOrderCsv("PO-2026-0001", consolidateLines(lines));
    expect(csv.split("\r\n")).toEqual([
      "po_reference,supplier_sku,description,quantity,unit_cost_eur,line_total_eur",
      'PO-2026-0001,KM-ALB-A,"Album, Ver. A",1,12.50,12.50',
      'PO-2026-0001,KM-ALB-B,"Album, Ver. B",3,12.50,37.50',
      'PO-2026-0001,KM-STICK,"Lightstick case, ""pink""",1,9.00,9.00',
      "",
    ]);
  });

  it("spreads shipping and duty over the lines by value", () => {
    const merged = consolidateLines(lines);
    // Goods 12.50 + 37.50 + 9.00 = 59.00; shipping 11.80 → +20 % on each line.
    expect(allocateLandedCost(merged, 1180)).toEqual([1500, 4500, 1080]);
  });
});
