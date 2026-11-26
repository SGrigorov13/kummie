import { sql, type SQL } from "drizzle-orm";

/**
 * Can a variant be bought from a supplier right now (D-063, B3)? Yes when an active supplier has
 * an active offer for it. When every supplier says "none" (all offers inactive), the shop shows
 * "out of stock" too. A variant without any offer (demo data only — real products cannot be
 * published without one) counts as available.
 *
 * Written with explicit aliases: Drizzle leaves columns unqualified in single-table selects, which
 * would make `id` ambiguous inside the sub-queries. The outer query must select from `variants`.
 */
export function supplierAvailable(): SQL<boolean> {
  return sql<boolean>`(
    not exists (select 1 from "supplier_offers" so0 where so0."variant_id" = "variants"."id")
    or exists (
      select 1 from "supplier_offers" so1
      inner join "suppliers" su1 on su1."id" = so1."supplier_id"
      where so1."variant_id" = "variants"."id" and so1."active" and su1."active"
    )
  )`;
}
