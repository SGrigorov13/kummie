import type { ProductCard, ProductDetail, ProductListFilters } from "@kummie/contracts";
import { and, asc, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import type { Database } from "../db/client";
import {
  categories,
  groups,
  productCompliance,
  productImages,
  products,
  subcategories,
  variants,
} from "../db/schema";
import { productImageView } from "../media/urls";
import type { CatalogueRepository } from "./repository";

type Country = "BG" | "RO" | "GR" | "PL";
const COUNTRIES: readonly string[] = ["BG", "RO", "GR", "PL"];

/** Escapes LIKE wildcards in user input. */
function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export function createPgCatalogueRepository(db: Database, mediaBaseUrl: string): CatalogueRepository {
  const minPrice = db
    .select({
      productId: variants.productId,
      priceCents: sql<number>`min(${variants.priceCents})`.as("price_cents"),
    })
    .from(variants)
    .where(eq(variants.active, true))
    .groupBy(variants.productId)
    .as("min_price");

  function filtersToWhere(f: ProductListFilters): SQL | undefined {
    const conditions: (SQL | undefined)[] = [eq(products.status, "published")];
    if (f.cat) conditions.push(eq(subcategories.categoryId, f.cat));
    if (f.sub) conditions.push(eq(products.subcategoryId, f.sub));
    if (f.gen) conditions.push(eq(groups.generation, f.gen));
    if (f.group) conditions.push(eq(products.groupId, f.group));
    if (f.limited) conditions.push(eq(products.isLimited, true));
    if (f.q) {
      const p = likePattern(f.q);
      conditions.push(
        or(
          ilike(products.title, p),
          ilike(products.summaryBg, p),
          ilike(products.summaryEn, p),
          ilike(groups.name, p),
          ilike(groups.aka, p),
          ilike(subcategories.nameBg, p),
          ilike(subcategories.nameEn, p),
        ),
      );
    }
    return and(...conditions);
  }

  async function firstImages(productIds: string[]) {
    if (productIds.length === 0) return new Map<string, typeof productImages.$inferSelect>();
    const rows = await db
      .select()
      .from(productImages)
      .where(inArray(productImages.productId, productIds))
      .orderBy(asc(productImages.position));
    const map = new Map<string, typeof productImages.$inferSelect>();
    for (const row of rows) if (!map.has(row.productId)) map.set(row.productId, row);
    return map;
  }

  const image = (row: typeof productImages.$inferSelect, title: string) =>
    productImageView(mediaBaseUrl, row, title);

  const cardColumns = {
    id: products.id,
    slug: products.slug,
    title: products.title,
    categoryId: subcategories.categoryId,
    subcategoryId: products.subcategoryId,
    groupId: products.groupId,
    groupName: groups.name,
    sourcing: products.sourcing,
    state: products.state,
    isLimited: products.isLimited,
    isDemo: products.isDemo,
    priceCents: minPrice.priceCents,
  };

  type CardRow = {
    id: string;
    slug: string;
    title: string;
    categoryId: string;
    subcategoryId: string;
    groupId: string | null;
    groupName: string | null;
    sourcing: ProductCard["sourcing"];
    state: "NEW_DROP" | "IN_STOCK_EU" | "PRE_ORDER" | null;
    isLimited: boolean;
    isDemo: boolean;
    priceCents: number;
  };

  function toCard(row: CardRow, img: typeof productImages.$inferSelect | undefined): ProductCard {
    return {
      slug: row.slug,
      title: row.title,
      categoryId: row.categoryId,
      subcategoryId: row.subcategoryId,
      groupId: row.groupId,
      groupName: row.groupName,
      sourcing: row.sourcing,
      stateBadge: row.isLimited ? "LIMITED" : (row.state ?? null),
      isLimited: row.isLimited,
      priceCents: Number(row.priceCents),
      currency: "EUR",
      image: img ? image(img, row.title) : null,
      isDemo: row.isDemo,
    };
  }

  return {
    async listCategories() {
      const [cats, subs] = await Promise.all([
        db.select().from(categories).orderBy(asc(categories.position)),
        db.select().from(subcategories).orderBy(asc(subcategories.position)),
      ]);
      return cats.map((c) => ({
        id: c.id,
        bg: c.nameBg,
        en: c.nameEn,
        subcategories: subs
          .filter((s) => s.categoryId === c.id)
          .map((s) => ({ id: s.id, bg: s.nameBg, en: s.nameEn })),
      }));
    },

    async listGroups() {
      const rows = await db.select().from(groups).orderBy(desc(groups.generation), asc(groups.name));
      return rows.map((g) => ({
        id: g.id,
        name: g.name,
        generation: g.generation,
        aka: g.aka,
        editorialCheck: g.editorialCheck,
      }));
    },

    async listProducts(f) {
      const where = filtersToWhere(f);
      const base = () =>
        db
          .select(cardColumns)
          .from(products)
          .innerJoin(subcategories, eq(subcategories.id, products.subcategoryId))
          .leftJoin(groups, eq(groups.id, products.groupId))
          .innerJoin(minPrice, eq(minPrice.productId, products.id))
          .where(where);
      const [rows, countRows] = await Promise.all([
        base()
          .orderBy(desc(products.publishedAt), asc(products.title))
          .limit(f.pageSize)
          .offset((f.page - 1) * f.pageSize),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(products)
          .innerJoin(subcategories, eq(subcategories.id, products.subcategoryId))
          .leftJoin(groups, eq(groups.id, products.groupId))
          .innerJoin(minPrice, eq(minPrice.productId, products.id))
          .where(where),
      ]);
      const images = await firstImages(rows.map((r) => r.id));
      return {
        items: rows.map((row) => toCard(row, images.get(row.id))),
        total: countRows[0]?.count ?? 0,
      };
    },

    async getProduct(slug) {
      const [row] = await db
        .select({ ...cardColumns, summaryBg: products.summaryBg, summaryEn: products.summaryEn })
        .from(products)
        .innerJoin(subcategories, eq(subcategories.id, products.subcategoryId))
        .leftJoin(groups, eq(groups.id, products.groupId))
        .innerJoin(minPrice, eq(minPrice.productId, products.id))
        .where(and(eq(products.slug, slug), eq(products.status, "published")));
      if (!row) return null;

      const [variantRows, complianceRows, imageRows] = await Promise.all([
        db
          .select()
          .from(variants)
          .where(and(eq(variants.productId, row.id), eq(variants.active, true)))
          .orderBy(asc(variants.position)),
        db.select().from(productCompliance).where(eq(productCompliance.productId, row.id)),
        db
          .select()
          .from(productImages)
          .where(eq(productImages.productId, row.id))
          .orderBy(asc(productImages.position)),
      ]);
      const c = complianceRows[0];
      // Published products always passed the gate; anything else is a data error, not a 404.
      if (!c || !c.dispatchEstimateBg || !c.dispatchEstimateEn || !c.manufacturer || !c.euResponsiblePerson) {
        throw new Error(`Published product ${slug} is missing compliance data`);
      }

      const detail: ProductDetail = {
        ...toCard(row, imageRows[0]),
        summary: { bg: row.summaryBg, en: row.summaryEn },
        variants: variantRows.map((v) => ({
          id: v.id,
          sku: v.sku,
          version: v.version,
          priceCents: v.priceCents,
        })),
        compliance: {
          dispatchEstimate: { bg: c.dispatchEstimateBg, en: c.dispatchEstimateEn },
          deliveryRegions: c.deliveryRegions.filter((r): r is Country => COUNTRIES.includes(r)),
          manufacturer: c.manufacturer,
          euResponsiblePerson: c.euResponsiblePerson,
          safetyInfo: c.safetyInfo ?? null,
          warnings: c.warnings,
          returnExceptions: c.returnExceptions,
        },
        images: imageRows.map((img) => image(img, row.title)),
      };
      return detail;
    },
  };
}
