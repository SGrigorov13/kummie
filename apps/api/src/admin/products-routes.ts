import {
  AdminProduct,
  AdminProductList,
  AdminProductListQuery,
  IdParams,
  ProductInput,
  PublishBlocked,
} from "@kummie/contracts";
import { missingComplianceFields, type ComplianceField, type Country } from "@kummie/core";
import { and, asc, desc, eq, ilike, inArray, notInArray, or, sql } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { loadComplianceDraft, publishProduct, PublishBlockedError } from "../catalogue/publish";
import type { Database } from "../db/client";
import { productCompliance, products, variants } from "../db/schema";
import { audit, requireStaff, type AdminDeps } from "./context";

const ApiError = z.object({ error: z.string(), message: z.string() });

class ConflictError extends Error {}

function isUniqueViolation(error: unknown): error is { constraint?: string } {
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

async function missingFor(db: Database, id: string): Promise<ComplianceField[]> {
  const draft = await loadComplianceDraft(db, id);
  return draft ? missingComplianceFields(draft) : [];
}

/** Full editable view of one product (any status). */
export async function loadAdminProduct(db: Database, id: string): Promise<AdminProduct | null> {
  const [p] = await db.select().from(products).where(eq(products.id, id));
  if (!p) return null;
  const [variantRows, complianceRows] = await Promise.all([
    db.select().from(variants).where(eq(variants.productId, id)).orderBy(asc(variants.position)),
    db.select().from(productCompliance).where(eq(productCompliance.productId, id)),
  ]);
  const c = complianceRows[0];
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    summary: { bg: p.summaryBg, en: p.summaryEn },
    subcategoryId: p.subcategoryId,
    groupId: p.groupId,
    sourcing: p.sourcing,
    state: p.state,
    isLimited: p.isLimited,
    status: p.status,
    isDemo: p.isDemo,
    updatedAt: p.updatedAt.toISOString(),
    variants: variantRows.map((v) => ({
      id: v.id,
      version: v.version,
      sku: v.sku,
      priceCents: v.priceCents,
      active: v.active,
    })),
    compliance: {
      dispatchEstimate: { bg: c?.dispatchEstimateBg ?? "", en: c?.dispatchEstimateEn ?? "" },
      deliveryRegions: (c?.deliveryRegions ?? []) as Country[],
      manufacturer: c?.manufacturer ?? "",
      euResponsiblePerson: c?.euResponsiblePerson ?? "",
      safetyInfo: c?.safetyInfo ?? null,
      warnings: c?.warnings ?? [],
      safetyNone: c?.safetyNone ?? false,
      returnExceptions: c?.returnExceptions ?? [],
      returnExceptionsNone: c?.returnExceptionsNone ?? false,
    },
    missing: await missingFor(db, id),
  };
}

/**
 * Writes the product, its variants and compliance data in one transaction. Removed variants are
 * deactivated, never deleted (orders will reference them). A published product must still pass the
 * GPSR gate after the change, otherwise nothing is saved.
 */
async function saveProduct(db: Database, id: string | null, input: ProductInput): Promise<string> {
  return db.transaction(async (tx) => {
    const now = new Date();
    const fields = {
      slug: input.slug,
      title: input.title,
      summaryBg: input.summary.bg,
      summaryEn: input.summary.en,
      subcategoryId: input.subcategoryId,
      groupId: input.groupId,
      sourcing: input.sourcing,
      state: input.state,
      isLimited: input.isLimited,
      updatedAt: now,
    };
    let productId = id;
    if (productId) {
      const updated = await tx
        .update(products)
        .set(fields)
        .where(eq(products.id, productId))
        .returning({ id: products.id });
      if (updated.length === 0) throw new Error("not_found");
    } else {
      const [row] = await tx
        .insert(products)
        .values({ ...fields, status: "draft" })
        .returning({ id: products.id });
      productId = row?.id ?? null;
      if (!productId) throw new Error("insert failed");
    }

    const keptIds: string[] = [];
    for (const [position, v] of input.variants.entries()) {
      if (v.id) {
        await tx
          .update(variants)
          .set({
            version: v.version,
            sku: v.sku,
            priceCents: v.priceCents,
            active: v.active,
            position,
            updatedAt: now,
          })
          .where(and(eq(variants.id, v.id), eq(variants.productId, productId)));
        keptIds.push(v.id);
      } else {
        const [row] = await tx
          .insert(variants)
          .values({
            productId,
            version: v.version,
            sku: v.sku,
            priceCents: v.priceCents,
            active: v.active,
            position,
          })
          .returning({ id: variants.id });
        if (row) keptIds.push(row.id);
      }
    }
    await tx
      .update(variants)
      .set({ active: false, updatedAt: now })
      .where(
        keptIds.length > 0
          ? and(eq(variants.productId, productId), notInArray(variants.id, keptIds))
          : eq(variants.productId, productId),
      );

    const c = input.compliance;
    const complianceValues = {
      dispatchEstimateBg: c.dispatchEstimate.bg,
      dispatchEstimateEn: c.dispatchEstimate.en,
      deliveryRegions: [...c.deliveryRegions],
      manufacturer: c.manufacturer,
      euResponsiblePerson: c.euResponsiblePerson,
      safetyInfo: c.safetyInfo,
      warnings: c.warnings,
      safetyNone: c.safetyNone,
      returnExceptions: c.returnExceptions,
      returnExceptionsNone: c.returnExceptionsNone,
      updatedAt: now,
    };
    await tx
      .insert(productCompliance)
      .values({ productId, ...complianceValues })
      .onConflictDoUpdate({ target: productCompliance.productId, set: complianceValues });

    const [status] = await tx
      .select({ status: products.status })
      .from(products)
      .where(eq(products.id, productId));
    if (status?.status === "published") {
      const draft = await loadComplianceDraft(tx as unknown as Database, productId);
      const missing = draft ? missingComplianceFields(draft) : [];
      if (missing.length > 0) throw new PublishBlockedError(missing);
    }
    return productId;
  });
}

export function productsAdminRoutes({ db }: AdminDeps): FastifyPluginAsyncZod {
  return async (app) => {
    const editors = requireStaff(db, ["admin", "content"]);

    app.get(
      "/admin-api/products",
      {
        preHandler: editors,
        schema: { querystring: AdminProductListQuery, response: { 200: AdminProductList } },
      },
      async (request) => {
        const { q, status } = request.query;
        const where = and(
          status ? eq(products.status, status) : undefined,
          q
            ? or(
                ilike(products.title, `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`),
                ilike(products.slug, `%${q}%`),
              )
            : undefined,
        );
        const rows = await db
          .select({
            id: products.id,
            slug: products.slug,
            title: products.title,
            status: products.status,
            sourcing: products.sourcing,
            isDemo: products.isDemo,
            updatedAt: products.updatedAt,
          })
          .from(products)
          .where(where)
          .orderBy(desc(products.updatedAt))
          .limit(200);
        const ids = rows.map((r) => r.id);
        const prices =
          ids.length === 0
            ? []
            : await db
                .select({
                  productId: variants.productId,
                  price: sql<number>`min(${variants.priceCents})::int`,
                })
                .from(variants)
                .where(and(inArray(variants.productId, ids), eq(variants.active, true)))
                .groupBy(variants.productId);
        const priceOf = new Map(prices.map((p) => [p.productId, p.price]));
        const items = await Promise.all(
          rows.map(async (r) => ({
            ...r,
            updatedAt: r.updatedAt.toISOString(),
            priceCents: priceOf.get(r.id) ?? null,
            missingCount: (await missingFor(db, r.id)).length,
          })),
        );
        return { items };
      },
    );

    app.get(
      "/admin-api/products/:id",
      { preHandler: editors, schema: { params: IdParams, response: { 200: AdminProduct, 404: ApiError } } },
      async (request, reply) => {
        const product = await loadAdminProduct(db, request.params.id);
        if (!product) return reply.code(404).send({ error: "not_found", message: "Product not found" });
        return product;
      },
    );

    const writeErrors = { 404: ApiError, 409: ApiError, 422: PublishBlocked };

    type WriteResult =
      | { ok: true; id: string }
      | { ok: false; status: 404 | 409; body: { error: string; message: string } }
      | {
          ok: false;
          status: 422;
          body: { error: "publish_blocked"; message: string; missing: ComplianceField[] };
        };

    /** Runs a write and maps known failures to HTTP answers (422 gate, 409 duplicate, 404). */
    async function tryWrite(action: () => Promise<string>): Promise<WriteResult> {
      try {
        return { ok: true, id: await action() };
      } catch (error) {
        if (error instanceof PublishBlockedError) {
          return {
            ok: false,
            status: 422,
            body: { error: "publish_blocked", message: error.message, missing: error.missing },
          };
        }
        if (isUniqueViolation(error) || error instanceof ConflictError) {
          return {
            ok: false,
            status: 409,
            body: { error: "conflict", message: "Slug or SKU is already used by another product" },
          };
        }
        if (error instanceof Error && error.message === "not_found") {
          return { ok: false, status: 404, body: { error: "not_found", message: "Product not found" } };
        }
        throw error;
      }
    }

    app.post(
      "/admin-api/products",
      {
        preHandler: editors,
        schema: { body: ProductInput, response: { 200: AdminProduct, ...writeErrors } },
      },
      async (request, reply) => {
        const result = await tryWrite(() => saveProduct(db, null, request.body));
        if (!result.ok) return reply.code(result.status).send(result.body);
        await audit(db, request.staff?.id ?? null, "product.created", "product", result.id, {
          slug: request.body.slug,
        });
        return (await loadAdminProduct(db, result.id)) as AdminProduct;
      },
    );

    app.put(
      "/admin-api/products/:id",
      {
        preHandler: editors,
        schema: { params: IdParams, body: ProductInput, response: { 200: AdminProduct, ...writeErrors } },
      },
      async (request, reply) => {
        const result = await tryWrite(() => saveProduct(db, request.params.id, request.body));
        if (!result.ok) return reply.code(result.status).send(result.body);
        await audit(db, request.staff?.id ?? null, "product.updated", "product", result.id);
        return (await loadAdminProduct(db, result.id)) as AdminProduct;
      },
    );

    app.post(
      "/admin-api/products/:id/publish",
      { preHandler: editors, schema: { params: IdParams, response: { 200: AdminProduct, ...writeErrors } } },
      async (request, reply) => {
        const id = request.params.id;
        if (!(await loadAdminProduct(db, id))) {
          return reply.code(404).send({ error: "not_found", message: "Product not found" });
        }
        const result = await tryWrite(async () => {
          await publishProduct(db, id);
          return id;
        });
        if (!result.ok) return reply.code(result.status).send(result.body);
        await audit(db, request.staff?.id ?? null, "product.published", "product", id);
        return (await loadAdminProduct(db, id)) as AdminProduct;
      },
    );

    app.post(
      "/admin-api/products/:id/unpublish",
      { preHandler: editors, schema: { params: IdParams, response: { 200: AdminProduct, 404: ApiError } } },
      async (request, reply) => {
        const id = request.params.id;
        const updated = await db
          .update(products)
          .set({ status: "draft", updatedAt: new Date() })
          .where(eq(products.id, id))
          .returning({ id: products.id });
        if (updated.length === 0)
          return reply.code(404).send({ error: "not_found", message: "Product not found" });
        await audit(db, request.staff?.id ?? null, "product.unpublished", "product", id);
        return (await loadAdminProduct(db, id)) as AdminProduct;
      },
    );
  };
}
