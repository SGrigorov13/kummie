import { describe, expect, it } from "vitest";
import {
  allocateLandedCost,
  orderProgressFromBatches,
  pickOffer,
  purchaseOrderReference,
  waitForMinimum,
  consolidateLines,
  nextBatchCloseAt,
  purchaseOrderCsv,
  purchaseOrderTotalCents,
  sofiaTime,
} from "./batches";

describe("nextBatchCloseAt", () => {
  it("closes Monday and Thursday at 08:30 Sofia time (D-063)", () => {
    // Tuesday 2026-11-24 11:00 Sofia (winter time UTC+2) → Thursday 08:30 Sofia.
    expect(nextBatchCloseAt(new Date("2026-11-24T09:00:00Z")).toISOString()).toBe("2026-11-26T06:30:00.000Z");
    // Exactly at closing time → the next one (Monday).
    expect(nextBatchCloseAt(new Date("2026-11-26T06:30:00Z")).toISOString()).toBe("2026-11-30T06:30:00.000Z");
    // Monday 08:29 Sofia → the same morning.
    expect(nextBatchCloseAt(new Date("2026-11-30T06:29:00Z")).toISOString()).toBe("2026-11-30T06:30:00.000Z");
  });

  it("follows summer time", () => {
    expect(sofiaTime(2027, 7, 5, 12).toISOString()).toBe("2027-07-05T09:00:00.000Z");
    expect(sofiaTime(2027, 7, 5, 8, 30).toISOString()).toBe("2027-07-05T05:30:00.000Z");
    // Saturday before the switch to summer time (28 March 2027) → Monday 08:30 at UTC+3.
    expect(nextBatchCloseAt(new Date("2027-03-27T12:00:00Z")).toISOString()).toBe("2027-03-29T05:30:00.000Z");
  });

  it("takes a custom schedule", () => {
    expect(
      nextBatchCloseAt(new Date("2026-11-24T09:00:00Z"), { weekdays: [2], hour: 18 }).toISOString(),
    ).toBe("2026-11-24T16:00:00.000Z");
    expect(() => nextBatchCloseAt(new Date(), { weekdays: [], hour: 12 })).toThrow();
    expect(() => nextBatchCloseAt(new Date(), { weekdays: [1], hour: 8, minute: 60 })).toThrow();
  });
});

describe("waitForMinimum (B2)", () => {
  const first = new Date("2026-11-30T06:30:00Z"); // Monday 08:30
  const base = { totalCents: 6000, minOrderCents: 15000, firstClosesAt: first };
  it("waits while the next closing is within 7 days of the first", () => {
    expect(waitForMinimum({ ...base, nextCloseAt: new Date("2026-12-03T06:30:00Z") })).toBe(true);
    expect(waitForMinimum({ ...base, nextCloseAt: new Date("2026-12-07T06:30:00Z") })).toBe(true);
    expect(waitForMinimum({ ...base, nextCloseAt: new Date("2026-12-10T06:30:00Z") })).toBe(false);
  });
  it("never waits without a minimum or once it is reached", () => {
    const next = new Date("2026-12-03T06:30:00Z");
    expect(waitForMinimum({ ...base, minOrderCents: 0, nextCloseAt: next })).toBe(false);
    expect(waitForMinimum({ ...base, totalCents: 15000, nextCloseAt: next })).toBe(false);
  });
});

describe("pickOffer (B3)", () => {
  it("prefers an EU supplier, then the cheapest", () => {
    const korea = { supplierId: "seoul", inEu: false, unitCostCents: 900 };
    const italy = { supplierId: "kmoon", inEu: true, unitCostCents: 1200 };
    const spain = { supplierId: "madrid", inEu: true, unitCostCents: 1100 };
    expect(pickOffer([korea, italy])).toBe(italy);
    expect(pickOffer([korea, italy, spain])).toBe(spain);
    expect(pickOffer([korea])).toBe(korea);
    expect(pickOffer([])).toBeNull();
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

describe("orderProgressFromBatches", () => {
  it("moves with the slowest line and waits for missing units", () => {
    expect(orderProgressFromBatches([])).toBeNull();
    expect(orderProgressFromBatches([{ batchStatus: "open", qty: 1, receivedQty: 0 }])).toBe("batched");
    expect(
      orderProgressFromBatches([
        { batchStatus: "shipped", qty: 1, receivedQty: 0 },
        { batchStatus: "ordered", qty: 2, receivedQty: 0 },
      ]),
    ).toBe("ordered_from_supplier");
    expect(orderProgressFromBatches([{ batchStatus: "received", qty: 2, receivedQty: 2 }])).toBe(
      "received_at_hub",
    );
    expect(orderProgressFromBatches([{ batchStatus: "received", qty: 2, receivedQty: 1 }])).toBe(
      "supplier_shipped",
    );
    expect(purchaseOrderReference(2026, 7)).toBe("PO-2026-0007");
  });
});
