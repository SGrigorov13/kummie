import { describe, expect, it } from "vitest";
import { IMPORT_COLUMNS, importTemplateCsv, parseCsv, productsFromCsv } from "./import";

const ctx = {
  subcategoryIds: new Set(["album", "pouches"]),
  groupIds: new Set(["stray-kids"]),
  defaultEuResponsible: "KUMMIE EU",
};
const header = IMPORT_COLUMNS.map((c) => c.key).join(";");
const row = (values: Record<string, string>) => IMPORT_COLUMNS.map((c) => values[c.key] ?? "").join(";");
const base = {
  slug: "ate-album",
  title: "ATE album",
  subcategory: "album",
  group: "stray-kids",
  sourcing: "OFFICIAL",
  state: "PRE_ORDER",
  version: "Ver. A",
  sku: "SKZ-ATE-A",
  price_eur: "29,90",
  dispatch_bg: "до 30 дни",
  dispatch_en: "within 30 days",
  manufacturer: "JYP Entertainment, Seoul",
  safety_none: "да",
  returns_bg: "Отворени запечатани албуми",
  returns_en: "Opened sealed albums",
  publish: "1",
};

describe("parseCsv", () => {
  it("handles ; or , separators, quotes, BOM and CRLF", () => {
    expect(parseCsv('﻿a;b\r\n"x;1";"say ""hi"""\r\n')).toEqual([
      ["a", "b"],
      ["x;1", 'say "hi"'],
    ]);
    expect(parseCsv("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("productsFromCsv", () => {
  it("groups rows by slug into one product with several versions", () => {
    const csv = [
      header,
      row(base),
      row({ slug: "ate-album", version: "Ver. B", sku: "skz-ate-b", price_eur: "31.50" }),
    ].join("\n");
    const { products, issues } = productsFromCsv(csv, ctx);
    expect(issues).toEqual([]);
    expect(products).toHaveLength(1);
    const [p] = products;
    expect(p?.publish).toBe(true);
    expect(p?.input).toMatchObject({
      slug: "ate-album",
      groupId: "stray-kids",
      state: "PRE_ORDER",
      variants: [
        { version: "Ver. A", sku: "SKZ-ATE-A", priceCents: 2990, active: true },
        { version: "Ver. B", sku: "SKZ-ATE-B", priceCents: 3150, active: true },
      ],
      compliance: {
        deliveryRegions: ["BG", "RO", "GR"],
        euResponsiblePerson: "KUMMIE EU",
        safetyNone: true,
        returnExceptions: [{ bg: "Отворени запечатани албуми", en: "Opened sealed albums" }],
      },
    });
  });

  it("skips comment rows and reports every problem with its line and column", () => {
    const csv = [
      header,
      "#ЗАДЪЛЖИТЕЛНО;по желание",
      row({ ...base, subcategory: "socks", sourcing: "FAKE", price_eur: "abc", sku: "bad sku" }),
      row({ ...base, slug: "Bad Slug!" }),
      row({ ...base, slug: "other", sku: "SKZ-ATE-A", warnings_bg: "Малки части", group: "nobody" }),
    ].join("\n");
    const { issues } = productsFromCsv(csv, ctx);
    expect(issues.map((i) => [i.line, i.column, i.code])).toEqual(
      expect.arrayContaining([
        [3, "subcategory", "unknown_subcategory"],
        [3, "sourcing", "invalid_value"],
        [3, "price_eur", "bad_price"],
        [3, "sku", "bad_sku"],
        [4, "slug", "bad_slug"],
        [5, "group", "unknown_group"],
        [5, "warnings_en", "missing_translation"],
      ]),
    );
  });

  it("flags a different product-level value on a later row and duplicate SKUs", () => {
    const csv = [
      header,
      row(base),
      row({ slug: "ate-album", title: "Other title", version: "Ver. B", sku: "SKZ-ATE-A", price_eur: "1" }),
    ].join("\n");
    const codes = productsFromCsv(csv, ctx).issues.map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(["conflicting_value", "duplicate_sku"]));
  });

  it("refuses a file without the required columns", () => {
    const { issues } = productsFromCsv("slug;title\nx;y", ctx);
    expect(issues.filter((i) => i.code === "missing_column").map((i) => i.column)).toContain("sku");
  });
});

describe("importTemplateCsv", () => {
  it("has the header, marks required columns and lists the codes, all as comments", () => {
    const csv = importTemplateCsv(
      [{ category: "Албуми", id: "album", name: "Албум" }],
      [{ id: "stray-kids", name: "Stray Kids" }],
    );
    const rows = parseCsv(csv);
    expect(rows[0]).toEqual(IMPORT_COLUMNS.map((c) => c.key));
    expect(rows[1]?.[0]).toBe("#ЗАДЪЛЖИТЕЛНО");
    expect(csv).toContain("#Албуми: album = Албум");
    expect(csv).toContain("stray-kids");
    // Only comments after the header: importing the untouched template adds nothing.
    expect(productsFromCsv(csv, ctx).products).toEqual([]);
  });
});
