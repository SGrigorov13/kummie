import { ProductImportReport, ProductImportRequest, type ImportIssue } from "@kummie/contracts";
import { missingComplianceFields } from "@kummie/core";
import { eq, inArray } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { importTemplateCsv, productsFromCsv } from "../catalogue/import";
import { loadComplianceDraft, publishProduct } from "../catalogue/publish";
import type { Database } from "../db/client";
import { categories, groups, products, subcategories, variants } from "../db/schema";
import { audit, requireStaff, type AdminDeps } from "./context";
import { saveProduct } from "./products-routes";
import { loadCompanySettings } from "./settings-routes";

/**
 * Admin → Каталог → Импорт: a CSV template with the required fields, and an import that first
 * checks the whole file (dry run) and then writes everything in one transaction — all or nothing.
 * Same rules as the editor: products are created as drafts and published only if they pass the
 * GPSR gate.
 */
export function importRoutes({ db }: AdminDeps): FastifyPluginAsyncZod {
  const editors = requireStaff(db, ["admin", "content"]);

  return async (app) => {
    app.get("/admin-api/products/import-template", { preHandler: editors }, async (_request, reply) => {
      const [subs, groupRows] = await Promise.all([
        db
          .select({ id: subcategories.id, name: subcategories.nameBg, category: categories.nameBg })
          .from(subcategories)
          .innerJoin(categories, eq(categories.id, subcategories.categoryId))
          .orderBy(categories.position, subcategories.position),
        db.select({ id: groups.id, name: groups.name }).from(groups).orderBy(groups.name),
      ]);
      return reply
        .header("content-type", "text/csv; charset=utf-8")
        .header("content-disposition", 'attachment; filename="kummie-products-template.csv"')
        .send(importTemplateCsv(subs, groupRows));
    });

    app.post(
      "/admin-api/products/import",
      {
        preHandler: editors,
        bodyLimit: 6 * 1024 * 1024,
        schema: { body: ProductImportRequest, response: { 200: ProductImportReport } },
      },
      async (request) => {
        const { csv, dryRun } = request.body;
        const [subRows, groupRows, company] = await Promise.all([
          db.select({ id: subcategories.id }).from(subcategories),
          db.select({ id: groups.id }).from(groups),
          loadCompanySettings(db),
        ]);
        const parsed = productsFromCsv(csv, {
          subcategoryIds: new Set(subRows.map((r) => r.id)),
          groupIds: new Set(groupRows.map((r) => r.id)),
          defaultEuResponsible: company.euResponsiblePerson,
        });
        const issues: ImportIssue[] = [...parsed.issues];

        // Existing products by address, and SKUs that already belong to another product.
        const slugs = parsed.products.map((p) => p.slug);
        const existing =
          slugs.length === 0
            ? []
            : await db
                .select({ id: products.id, slug: products.slug, status: products.status })
                .from(products)
                .where(inArray(products.slug, slugs));
        const bySlug = new Map(existing.map((p) => [p.slug, p]));
        const skus = parsed.products.flatMap((p) => p.input.variants.map((v) => v.sku)).filter(Boolean);
        const taken =
          skus.length === 0
            ? []
            : await db
                .select({ sku: variants.sku, productId: variants.productId, id: variants.id })
                .from(variants)
                .where(inArray(variants.sku, skus));
        for (const p of parsed.products) {
          const own = bySlug.get(p.slug)?.id;
          p.input.variants.forEach((v, i) => {
            const other = taken.find((t) => t.sku === v.sku && t.productId !== own);
            if (other)
              issues.push({
                line: p.lines[i] ?? 0,
                column: "sku",
                code: "sku_of_other_product",
                value: v.sku,
              });
            const mine = taken.find((t) => t.sku === v.sku && t.productId === own);
            // Keep the variant id for SKUs the product already has, so orders keep pointing at it.
            if (mine) v.id = mine.id;
          });
        }

        const report = (
          applied: boolean,
          statuses = new Map<string, "draft" | "published" | "archived">(),
          blocked = new Map<string, ReturnType<typeof missingComplianceFields>>(),
        ) => ({
          applied,
          issues: issues.toSorted((a, b) => a.line - b.line),
          products: parsed.products.map((p) => ({
            slug: p.slug,
            title: p.input.title,
            action: bySlug.has(p.slug) ? ("update" as const) : ("create" as const),
            variants: p.input.variants.length,
            publish: p.publish,
            // What blocked publishing in the database (e.g. no supplier offer yet, D-063) or, before
            // saving, what the file itself is missing.
            missing:
              blocked.get(p.slug) ??
              missingComplianceFields({
                title: p.input.title,
                sourcing: p.input.sourcing,
                state: p.input.state,
                isLimited: p.input.isLimited,
                versions: p.input.variants.map((v) => v.version),
                pricesCents: p.input.variants.map((v) => v.priceCents),
                ...p.input.compliance,
              }),
            status: statuses.get(p.slug) ?? bySlug.get(p.slug)?.status ?? null,
          })),
        });

        if (dryRun || issues.length > 0) return report(false);

        const statuses = new Map<string, "draft" | "published" | "archived">();
        const blocked = new Map<string, ReturnType<typeof missingComplianceFields>>();
        await db.transaction(async (tx) => {
          const t = tx as unknown as Database;
          for (const p of parsed.products) {
            const id = await saveProduct(t, bySlug.get(p.slug)?.id ?? null, p.input);
            let status = bySlug.get(p.slug)?.status ?? "draft";
            if (p.publish && status !== "published") {
              const draft = await loadComplianceDraft(t, id);
              const missing = draft ? missingComplianceFields(draft) : [];
              if (draft && missing.length === 0) {
                await publishProduct(t, id);
                status = "published";
              } else if (missing.length > 0) blocked.set(p.slug, missing);
            }
            statuses.set(p.slug, status);
          }
        });
        await audit(db, request.staff?.id ?? null, "product.import", "product", null, {
          created: parsed.products.filter((p) => !bySlug.has(p.slug)).length,
          updated: parsed.products.filter((p) => bySlug.has(p.slug)).length,
        });
        return report(true, statuses, blocked);
      },
    );
  };
}
