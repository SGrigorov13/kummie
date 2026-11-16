import { badgeProblems, missingComplianceFields, type ComplianceField, type Country } from "@kummie/core";
import { asc, eq } from "drizzle-orm";
import type { Database } from "../db/client";
import { productCompliance, products, variants } from "../db/schema";

export class PublishBlockedError extends Error {
  constructor(readonly missing: ComplianceField[]) {
    super(`Cannot publish: missing ${missing.join(", ")}`);
    this.name = "PublishBlockedError";
  }
}

/** Loads what the gate needs for one product from the database. */
export async function loadComplianceDraft(db: Database, productId: string) {
  const [product] = await db.select().from(products).where(eq(products.id, productId));
  if (!product) return null;
  const [variantRows, complianceRows] = await Promise.all([
    db.select().from(variants).where(eq(variants.productId, productId)).orderBy(asc(variants.position)),
    db.select().from(productCompliance).where(eq(productCompliance.productId, productId)),
  ]);
  const active = variantRows.filter((v) => v.active);
  const c = complianceRows[0];
  return {
    title: product.title,
    sourcing: product.sourcing,
    state: product.state,
    isLimited: product.isLimited,
    versions: active.map((v) => v.version),
    pricesCents: active.map((v) => v.priceCents),
    dispatchEstimate: c ? { bg: c.dispatchEstimateBg ?? "", en: c.dispatchEstimateEn ?? "" } : null,
    deliveryRegions: (c?.deliveryRegions ?? []) as Country[],
    manufacturer: c?.manufacturer ?? null,
    euResponsiblePerson: c?.euResponsiblePerson ?? null,
    safetyInfo: c?.safetyInfo ?? null,
    warnings: c?.warnings ?? [],
    safetyNone: c?.safetyNone ?? false,
    returnExceptions: c?.returnExceptions ?? [],
    returnExceptionsNone: c?.returnExceptionsNone ?? false,
  };
}

/**
 * Publishes a product only when the GPSR gate passes (CLAUDE.md: a product without these fields
 * cannot be published). Throws PublishBlockedError listing what is missing.
 */
export async function publishProduct(db: Database, productId: string, now = new Date()): Promise<void> {
  const draft = await loadComplianceDraft(db, productId);
  if (!draft) throw new Error(`Unknown product ${productId}`);
  const missing = missingComplianceFields(draft);
  if (missing.length > 0) throw new PublishBlockedError(missing);
  const problems = badgeProblems(draft);
  if (problems.length > 0) throw new Error(problems.join("; "));
  await db
    .update(products)
    .set({ status: "published", publishedAt: now, updatedAt: now })
    .where(eq(products.id, productId));
}
