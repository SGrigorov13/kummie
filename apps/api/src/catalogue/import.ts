import type { ImportIssue, ImportIssueCode, ProductInput } from "@kummie/contracts";
import { parseEuroToCents, type Country } from "@kummie/core";

/**
 * Product import from a CSV file (Admin → Каталог → Импорт). One row = one version (variant) of a
 * product; rows with the same `slug` form one product. Product-level columns may be repeated on every
 * row or left empty after the first. Lines whose first cell starts with "#" are comments (the
 * template's help and example rows). Pure functions — the route does the database work.
 */

export type ImportColumn = {
  key: string;
  required: boolean;
  /** Help text for the template (Bulgarian, the owner's working language). */
  help: string;
};

export const IMPORT_COLUMNS: readonly ImportColumn[] = [
  {
    key: "slug",
    required: true,
    help: "Адрес на продукта в сайта: малки латински букви, цифри и тире (напр. stray-kids-ate-album). Еднакъв на всички редове на един продукт.",
  },
  { key: "title", required: true, help: "Заглавие, както се вижда в магазина." },
  { key: "summary_bg", required: false, help: "Кратко описание на български." },
  { key: "summary_en", required: false, help: "Кратко описание на английски." },
  {
    key: "subcategory",
    required: true,
    help: "Подкатегория — код от списъка по-долу (напр. album, photocards, binders).",
  },
  {
    key: "group",
    required: false,
    help: "Група — код от списъка по-долу (напр. stray-kids). Празно = без група.",
  },
  {
    key: "sourcing",
    required: true,
    help: "Произход: OFFICIAL, KUMMIE_ORIGINAL, LICENSED или SUPPLIER_DIRECT.",
  },
  { key: "state", required: false, help: "Състояние: NEW_DROP, IN_STOCK_EU, PRE_ORDER или празно." },
  { key: "limited", required: false, help: "Лимитиран (розовият бадж): 1/да или 0/не. Само ако е вярно." },
  {
    key: "version",
    required: true,
    help: "Версия — по един ред за всяка (напр. Ver. A, Digipack, One size).",
  },
  { key: "sku", required: true, help: "SKU на версията: главни латински букви, цифри и тире, уникален." },
  { key: "price_eur", required: true, help: "Цена в евро с ДДС, напр. 29,90." },
  { key: "dispatch_bg", required: true, help: "Срок за изпращане на български (напр. 3–5 работни дни)." },
  { key: "dispatch_en", required: true, help: "Срок за изпращане на английски." },
  { key: "regions", required: false, help: "Държави за доставка: BG,RO,GR (празно = BG,RO,GR)." },
  { key: "manufacturer", required: true, help: "Производител (име и адрес) — GPSR." },
  { key: "eu_responsible", required: false, help: "Отговорно лице в ЕС — празно = това от Админ → Фирма." },
  { key: "safety_bg", required: false, help: "Информация за безопасност на български." },
  { key: "safety_en", required: false, help: "Информация за безопасност на английски." },
  { key: "warnings_bg", required: false, help: "Предупреждения на български, разделени с |" },
  { key: "warnings_en", required: false, help: "Предупреждения на английски, разделени с | (същия брой)." },
  {
    key: "safety_none",
    required: false,
    help: "1/да, ако няма специална информация за безопасност и предупреждения.",
  },
  { key: "returns_bg", required: false, help: "Изключения при връщане на български, разделени с |" },
  {
    key: "returns_en",
    required: false,
    help: "Изключения при връщане на английски, разделени с | (същия брой).",
  },
  { key: "returns_none", required: false, help: "1/да, ако няма изключения извън законовите." },
  {
    key: "publish",
    required: false,
    help: "1/да — публикувай веднага, ако всичко задължително е попълнено; иначе остава чернова.",
  },
];

const PRODUCT_KEYS = [
  "title",
  "summary_bg",
  "summary_en",
  "subcategory",
  "group",
  "sourcing",
  "state",
  "limited",
  "dispatch_bg",
  "dispatch_en",
  "regions",
  "manufacturer",
  "eu_responsible",
  "safety_bg",
  "safety_en",
  "warnings_bg",
  "warnings_en",
  "safety_none",
  "returns_bg",
  "returns_en",
  "returns_none",
  "publish",
] as const;

export const MAX_IMPORT_ROWS = 2000;
const SOURCING = ["OFFICIAL", "KUMMIE_ORIGINAL", "LICENSED", "SUPPLIER_DIRECT"] as const;
const STATES = ["NEW_DROP", "IN_STOCK_EU", "PRE_ORDER"] as const;
const REGIONS: readonly Country[] = ["BG", "RO", "GR", "PL"];

/**
 * Parses CSV text: `;` or `,` separated (detected from the header), quotes with "" escapes,
 * CRLF/LF, a UTF-8 BOM. Returns rows of trimmed cells.
 */
export function parseCsv(text: string): string[][] {
  const source = text.replace(/^﻿/, "");
  const firstLine = source.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell.trim() === "") {
      quoted = true;
      cell = "";
    } else if (ch === delimiter) {
      row.push(cell.trim());
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && source[i + 1] === "\n") i++;
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell.trim());
    rows.push(row);
  }
  return rows;
}

const TRUE = new Set(["1", "да", "yes", "true", "y", "д"]);
const FALSE = new Set(["", "0", "не", "no", "false", "n", "н"]);

export type ImportContext = {
  subcategoryIds: ReadonlySet<string>;
  groupIds: ReadonlySet<string>;
  /** Admin → Фирма default, used when `eu_responsible` is empty. */
  defaultEuResponsible: string | null;
};

export type ParsedProduct = {
  slug: string;
  input: ProductInput;
  publish: boolean;
  /** File lines of its rows. */
  lines: number[];
};

/** Turns the CSV rows into products, collecting every problem with its line and column. */
export function productsFromCsv(
  text: string,
  ctx: ImportContext,
): { products: ParsedProduct[]; issues: ImportIssue[] } {
  const issues: ImportIssue[] = [];
  const issue = (line: number, column: string | null, code: ImportIssueCode, value: string | null = null) =>
    issues.push({ line, column, code, value: value === null ? null : value.slice(0, 120) });

  const all = parseCsv(text);
  const headerIndex = all.findIndex((r) => r.some((c) => c !== "") && !(r[0] ?? "").startsWith("#"));
  if (headerIndex < 0) {
    issue(1, null, "empty_file");
    return { products: [], issues };
  }
  const header = (all[headerIndex] ?? []).map((h) => h.trim().toLowerCase());
  const known = new Set(IMPORT_COLUMNS.map((c) => c.key));
  header.forEach((h) => {
    if (h && !known.has(h)) issue(headerIndex + 1, h, "unknown_column");
  });
  for (const column of IMPORT_COLUMNS) {
    if (column.required && !header.includes(column.key)) issue(headerIndex + 1, column.key, "missing_column");
  }
  if (issues.some((i) => i.code === "missing_column")) return { products: [], issues };

  const dataRows = all
    .map((cells, index) => ({ cells, line: index + 1 }))
    .slice(headerIndex + 1)
    .filter(({ cells }) => cells.some((c) => c !== "") && !(cells[0] ?? "").startsWith("#"));
  if (dataRows.length === 0) {
    issue(headerIndex + 2, null, "empty_file");
    return { products: [], issues };
  }
  if (dataRows.length > MAX_IMPORT_ROWS) {
    issue(headerIndex + 2, null, "too_many_rows", String(dataRows.length));
    return { products: [], issues };
  }

  const groups = new Map<string, { rows: { get: (k: string) => string; line: number }[] }>();
  const skuLines = new Map<string, number>();
  for (const { cells, line } of dataRows) {
    const get = (key: string) => {
      const i = header.indexOf(key);
      return i >= 0 ? (cells[i] ?? "").trim() : "";
    };
    const slug = get("slug").toLowerCase();
    if (!/^[a-z0-9-]{2,80}$/.test(slug)) {
      issue(line, "slug", slug ? "bad_slug" : "required", slug || null);
      continue;
    }
    const sku = get("sku").toUpperCase();
    if (sku) {
      const seen = skuLines.get(sku);
      if (seen !== undefined) issue(line, "sku", "duplicate_sku", sku);
      else skuLines.set(sku, line);
    }
    const entry = groups.get(slug) ?? { rows: [] };
    entry.rows.push({ get, line });
    groups.set(slug, entry);
  }

  const products: ParsedProduct[] = [];
  for (const [slug, { rows }] of groups) {
    const first = rows[0];
    if (!first) continue;
    // Product-level value: the first non-empty one; a different non-empty value later is a conflict.
    const value = (key: (typeof PRODUCT_KEYS)[number]) => {
      let found = "";
      for (const r of rows) {
        const v = r.get(key);
        if (!v) continue;
        if (!found) found = v;
        else if (v !== found) issue(r.line, key, "conflicting_value", v);
      }
      return found;
    };
    const line = first.line;
    const flag = (key: (typeof PRODUCT_KEYS)[number]) => {
      const v = value(key).toLowerCase();
      if (TRUE.has(v)) return true;
      if (!FALSE.has(v)) issue(line, key, "invalid_value", v);
      return false;
    };
    const list = (key: (typeof PRODUCT_KEYS)[number]) =>
      value(key)
        .split("|")
        .map((s) => s.trim())
        .filter(Boolean);
    const pairs = (bgKey: (typeof PRODUCT_KEYS)[number], enKey: (typeof PRODUCT_KEYS)[number]) => {
      const bg = list(bgKey);
      const en = list(enKey);
      if (bg.length !== en.length) {
        issue(line, bg.length > en.length ? enKey : bgKey, "missing_translation");
        return [];
      }
      return bg.map((entry, i) => ({ bg: entry, en: en[i] ?? "" }));
    };

    const title = value("title");
    if (!title) issue(line, "title", "required");
    const subcategory = value("subcategory");
    if (!subcategory) issue(line, "subcategory", "required");
    else if (!ctx.subcategoryIds.has(subcategory))
      issue(line, "subcategory", "unknown_subcategory", subcategory);
    const group = value("group");
    if (group && !ctx.groupIds.has(group)) issue(line, "group", "unknown_group", group);
    const sourcing = value("sourcing").toUpperCase();
    if (!sourcing) issue(line, "sourcing", "required");
    else if (!(SOURCING as readonly string[]).includes(sourcing))
      issue(line, "sourcing", "invalid_value", sourcing);
    const state = value("state").toUpperCase();
    if (state && !(STATES as readonly string[]).includes(state)) issue(line, "state", "invalid_value", state);
    const regionsText = value("regions");
    const regions = (
      regionsText
        ? regionsText
            .toUpperCase()
            .split(/[\s,]+/)
            .filter(Boolean)
        : ["BG", "RO", "GR"]
    ).filter((r) => {
      if ((REGIONS as readonly string[]).includes(r)) return true;
      issue(line, "regions", "unknown_region", r);
      return false;
    }) as Country[];
    const safetyBg = value("safety_bg");
    const safetyEn = value("safety_en");
    if (Boolean(safetyBg) !== Boolean(safetyEn))
      issue(line, safetyBg ? "safety_en" : "safety_bg", "missing_translation");

    const variants: ProductInput["variants"] = [];
    for (const r of rows) {
      const version = r.get("version");
      if (!version) issue(r.line, "version", "required");
      const sku = r.get("sku").toUpperCase();
      if (!sku) issue(r.line, "sku", "required");
      else if (!/^[A-Z0-9-]{2,40}$/.test(sku)) issue(r.line, "sku", "bad_sku", sku);
      const priceText = r.get("price_eur").replace(/\s|€/g, "");
      const price = priceText ? parseEuroToCents(priceText) : undefined;
      if (!priceText) issue(r.line, "price_eur", "required");
      else if (price === undefined || price <= 0) issue(r.line, "price_eur", "bad_price", priceText);
      variants.push({ version, sku, priceCents: price ?? 0, active: true });
    }

    products.push({
      slug,
      lines: rows.map((r) => r.line),
      publish: flag("publish"),
      input: {
        slug,
        title,
        summary: { bg: value("summary_bg"), en: value("summary_en") },
        subcategoryId: subcategory,
        groupId: group || null,
        sourcing: (SOURCING as readonly string[]).includes(sourcing)
          ? (sourcing as ProductInput["sourcing"])
          : "KUMMIE_ORIGINAL",
        state: (STATES as readonly string[]).includes(state)
          ? (state as NonNullable<ProductInput["state"]>)
          : null,
        isLimited: flag("limited"),
        variants,
        compliance: {
          dispatchEstimate: { bg: value("dispatch_bg"), en: value("dispatch_en") },
          deliveryRegions: regions,
          manufacturer: value("manufacturer"),
          euResponsiblePerson: value("eu_responsible") || ctx.defaultEuResponsible || "",
          safetyInfo: safetyBg && safetyEn ? { bg: safetyBg, en: safetyEn } : null,
          warnings: pairs("warnings_bg", "warnings_en"),
          safetyNone: flag("safety_none"),
          returnExceptions: pairs("returns_bg", "returns_en"),
          returnExceptionsNone: flag("returns_none"),
        },
      },
    });
  }
  return { products, issues: issues.toSorted((a, b) => a.line - b.line) };
}

const cell = (value: string) => (/[;"\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

/**
 * The template: header, then comment rows (marked "#") with "ЗАДЪЛЖИТЕЛНО", the help per column, an
 * example product and every allowed subcategory and group code. Comment rows are ignored on import.
 */
export function importTemplateCsv(
  subcategories: readonly { category: string; id: string; name: string }[],
  groups: readonly { id: string; name: string }[],
): string {
  const keys = IMPORT_COLUMNS.map((c) => c.key);
  const example: Record<string, string> = {
    slug: "kummie-example-pouch",
    title: "KUMMIE Example Pouch",
    summary_bg: "Несесер с KUMMIE звезда.",
    summary_en: "Pouch with the KUMMIE star.",
    subcategory: "pouches",
    group: "",
    sourcing: "KUMMIE_ORIGINAL",
    state: "NEW_DROP",
    limited: "0",
    version: "One size",
    sku: "KUM-EX-POUCH",
    price_eur: "12,90",
    dispatch_bg: "3–5 работни дни",
    dispatch_en: "3–5 working days",
    regions: "BG,RO,GR",
    manufacturer: "Пример ООД, ул. Примерна 1, София",
    eu_responsible: "",
    safety_bg: "",
    safety_en: "",
    warnings_bg: "",
    warnings_en: "",
    safety_none: "1",
    returns_bg: "",
    returns_en: "",
    returns_none: "1",
    publish: "0",
  };
  const lines = [
    keys.join(";"),
    IMPORT_COLUMNS.map((c, i) => `${i === 0 ? "#" : ""}${c.required ? "ЗАДЪЛЖИТЕЛНО" : "по желание"}`).join(
      ";",
    ),
    IMPORT_COLUMNS.map((c, i) => cell(`${i === 0 ? "#" : ""}${c.help}`)).join(";"),
    keys.map((k, i) => cell(`${i === 0 ? "#" : ""}${example[k] ?? ""}`)).join(";"),
    "#Редовете, които започват с #, са помощ и не се внасят. Изтрий примера и попълни свои редове под заглавния ред.",
    "#Подкатегории (код = име):",
    ...[...new Set(subcategories.map((s) => s.category))].map(
      (category) =>
        `#${category}: ${subcategories
          .filter((s) => s.category === category)
          .map((s) => `${s.id} = ${s.name}`)
          .join(", ")}`,
    ),
    `#Групи (код): ${groups.map((g) => g.id).join(", ")}`,
  ];
  return `﻿${lines.map((l) => (l.startsWith("#") && !l.includes(";") ? cell(l) : l)).join("\r\n")}\r\n`;
}
