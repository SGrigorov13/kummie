import { describe, expect, it } from "vitest";
import { parseOfferCsv } from "./offers-import";

describe("parseOfferCsv", () => {
  it("reads a Bulgarian Excel export (semicolons, decimal comma)", () => {
    const csv =
      "﻿sku;supplier_sku;unit_cost_eur;active\r\nalb-1-a;km-001;7,50;да\r\nALB-1-B;KM-002;12;не\r\n";
    expect(parseOfferCsv(csv)).toEqual({
      rows: [
        { row: 2, sku: "ALB-1-A", supplierSku: "KM-001", unitCostCents: 750, active: true },
        { row: 3, sku: "ALB-1-B", supplierSku: "KM-002", unitCostCents: 1200, active: false },
      ],
      issues: [],
    });
  });

  it("takes columns in any order, active optional, euro signs allowed", () => {
    const csv = "unit_cost_eur,sku,supplier_sku\n€ 9.90,LS-1,KM-LS\n";
    expect(parseOfferCsv(csv).rows).toEqual([
      { row: 2, sku: "LS-1", supplierSku: "KM-LS", unitCostCents: 990, active: true },
    ]);
  });

  it("reports bad rows and keeps the good ones", () => {
    const csv =
      "sku;supplier_sku;unit_cost_eur;active\nA-1;K1;abc;\n;K2;5;\nA-3;;5;\nA-4;K4;5;maybe\nA-5;K5;5;\nA-5;K6;6;\n";
    const result = parseOfferCsv(csv);
    expect(result.rows.map((r) => r.sku)).toEqual(["A-5"]);
    expect(result.issues.map((i) => i.row)).toEqual([2, 3, 4, 5, 7]);
  });

  it("needs the three columns", () => {
    expect(parseOfferCsv("sku;cost\nA;1\n").issues).toHaveLength(1);
    expect(parseOfferCsv("").issues).toHaveLength(1);
  });
});
