import { pathToFileURL } from "node:url";
import { groups as seedGroups, products as demoProducts, TAXONOMY } from "@kummie/core";
import { eq, sql } from "drizzle-orm";
import { publishProduct } from "../catalogue/publish";
import { loadConfig } from "../config";
import { createDatabase, type Database } from "./client";
import { categories, groups, productCompliance, products, subcategories, variants } from "./schema";

/**
 * Seeds reference data and the demo catalogue. Safe to run again: reference data is upserted and
 * demo products are only created when their slug does not exist yet.
 *
 * - groups from data/seed/groups.json (metadata only, editorial check pending)
 * - categories and subcategories from data/seed/merch-taxonomy.json
 * - the demo products (is_demo = true), published through the same GPSR gate as real products
 */
export type SeedResult = { groups: number; categories: number; products: number; created: number };

export async function seed(db: Database): Promise<SeedResult> {
  await db.transaction(async (tx) => {
    for (const g of seedGroups) {
      await tx
        .insert(groups)
        .values({
          id: g.id,
          name: g.name,
          generation: g.generation,
          aka: g.aka ?? null,
          editorialCheck: g.editorialCheck,
        })
        .onConflictDoUpdate({
          target: groups.id,
          set: { name: g.name, generation: g.generation, aka: g.aka ?? null },
        });
    }
    for (const [ci, c] of TAXONOMY.entries()) {
      await tx
        .insert(categories)
        .values({ id: c.id, nameBg: c.bg, nameEn: c.en, position: ci })
        .onConflictDoUpdate({ target: categories.id, set: { nameBg: c.bg, nameEn: c.en, position: ci } });
      for (const [si, s] of c.subcategories.entries()) {
        await tx
          .insert(subcategories)
          .values({ id: s.id, categoryId: c.id, nameBg: s.bg, nameEn: s.en, position: si })
          .onConflictDoUpdate({
            target: subcategories.id,
            set: { categoryId: c.id, nameBg: s.bg, nameEn: s.en, position: si },
          });
      }
    }
  });

  let created = 0;
  for (const p of demoProducts) {
    const existing = await db.select({ id: products.id }).from(products).where(eq(products.slug, p.id));
    if (existing.length > 0) continue;
    const productId = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(products)
        .values({
          slug: p.id,
          title: p.title,
          summaryBg: p.summary.bg,
          summaryEn: p.summary.en,
          subcategoryId: p.subcategory,
          groupId: p.groupId ?? null,
          sourcing: p.sourcing,
          state: p.state ?? null,
          isLimited: p.isLimited,
          isDemo: true,
        })
        .returning({ id: products.id });
      if (!row) throw new Error(`Could not insert ${p.id}`);
      await tx.insert(variants).values({
        productId: row.id,
        version: p.version,
        sku: `${p.id.toUpperCase()}-1`,
        priceCents: p.priceCents,
      });
      const warnings = p.compliance.warnings ?? [];
      const exceptions = p.returnExceptions ?? [];
      await tx.insert(productCompliance).values({
        productId: row.id,
        dispatchEstimateBg: p.dispatchEstimate.bg,
        dispatchEstimateEn: p.dispatchEstimate.en,
        deliveryRegions: [...p.deliveryRegions],
        manufacturer: p.compliance.manufacturer,
        euResponsiblePerson: p.compliance.responsiblePerson,
        safetyInfo: p.compliance.safetyInfo ?? null,
        warnings,
        safetyNone: !p.compliance.safetyInfo && warnings.length === 0,
        returnExceptions: exceptions,
        returnExceptionsNone: exceptions.length === 0,
      });
      return row.id;
    });
    await publishProduct(db, productId);
    created += 1;
  }

  const [counts] = await db
    .select({
      groups: sql<number>`(select count(*)::int from ${groups})`,
      categories: sql<number>`(select count(*)::int from ${categories})`,
      products: sql<number>`(select count(*)::int from ${products})`,
    })
    .from(sql`(select 1) as one`);
  return { ...(counts ?? { groups: 0, categories: 0, products: 0 }), created };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = loadConfig();
  if (!config.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Copy apps/api/.env.example to apps/api/.env.");
    process.exit(1);
  }
  const handle = createDatabase(config.DATABASE_URL, 1);
  seed(handle.db)
    .then((r) =>
      console.log(
        `Seeded: ${r.groups} groups, ${r.categories} categories, ${r.products} products (${r.created} new)`,
      ),
    )
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => handle.close());
}
