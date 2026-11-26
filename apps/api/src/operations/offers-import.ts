import { parseEuroToCents } from "@kummie/core";
import { parseCsv } from "../catalogue/import";

/**
 * A supplier price list (D-063, B3): one row per product, read from CSV (Excel "CSV UTF-8" with
 * `;` or `,`). Columns, by header name in any order:
 *   sku            our variant SKU (required)
 *   supplier_sku   the supplier's code (required)
 *   unit_cost_eur  our cost incl. any tax the supplier charges, e.g. 7,50 (required)
 *   active         yes/no, 1/0, да/не (optional, default yes; "no" = the supplier has none)
 * Costs are internal only: customers never see them.
 */
export type OfferRow = {
  row: number;
  sku: string;
  supplierSku: string;
  unitCostCents: number;
  active: boolean;
};
export type OfferIssue = { row: number; message: string };

const HEADERS = {
  sku: ["sku", "наш sku", "артикул"],
  supplierSku: ["supplier_sku", "supplier sku", "код на доставчика"],
  cost: ["unit_cost_eur", "unit cost", "cost", "цена", "цена на едро"],
  active: ["active", "активна", "наличност"],
} as const;

const YES = new Set(["", "1", "yes", "y", "true", "да", "x", "✓"]);
const NO = new Set(["0", "no", "n", "false", "не", "-"]);

export function parseOfferCsv(text: string): { rows: OfferRow[]; issues: OfferIssue[] } {
  const [header, ...body] = parseCsv(text);
  const issues: OfferIssue[] = [];
  if (!header) return { rows: [], issues: [{ row: 1, message: "The file is empty" }] };
  const names = header.map((h) => h.trim().toLowerCase());
  const column = (aliases: readonly string[]) => names.findIndex((n) => aliases.includes(n));
  const col = {
    sku: column(HEADERS.sku),
    supplierSku: column(HEADERS.supplierSku),
    cost: column(HEADERS.cost),
    active: column(HEADERS.active),
  };
  if (col.sku < 0 || col.supplierSku < 0 || col.cost < 0)
    return {
      rows: [],
      issues: [{ row: 1, message: "Columns needed: sku, supplier_sku, unit_cost_eur (active is optional)" }],
    };

  const rows: OfferRow[] = [];
  const seen = new Set<string>();
  body.forEach((cells, i) => {
    const row = i + 2;
    if (cells.every((c) => c.trim() === "")) return;
    const sku = (cells[col.sku] ?? "").trim().toUpperCase();
    const supplierSku = (cells[col.supplierSku] ?? "").trim().toUpperCase();
    const costText = (cells[col.cost] ?? "").trim().replace(/\s|€|eur/gi, "");
    const activeText = col.active < 0 ? "" : (cells[col.active] ?? "").trim().toLowerCase();
    if (!sku) return issues.push({ row, message: "SKU is empty" });
    if (!supplierSku) return issues.push({ row, message: `${sku}: supplier code is empty` });
    if (supplierSku.length > 64) return issues.push({ row, message: `${sku}: supplier code is too long` });
    const unitCostCents = parseEuroToCents(costText);
    if (!unitCostCents) return issues.push({ row, message: `${sku}: cost "${costText}" is not an amount` });
    if (!YES.has(activeText) && !NO.has(activeText))
      return issues.push({ row, message: `${sku}: active must be yes or no` });
    if (seen.has(sku)) return issues.push({ row, message: `${sku}: appears twice` });
    seen.add(sku);
    rows.push({ row, sku, supplierSku, unitCostCents, active: !NO.has(activeText) });
  });
  return { rows, issues };
}
