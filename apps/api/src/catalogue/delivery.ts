import { estimateDelivery, pickOffer, type DeliveryWindow } from "@kummie/core";
import { and, eq, inArray } from "drizzle-orm";
import { loadCompanySettings } from "../admin/settings-routes";
import type { Database } from "../db/client";
import { products, supplierOffers, suppliers, variants } from "../db/schema";

export type Country = "BG" | "RO" | "GR";
export type CountryWindows = Record<Country, DeliveryWindow | null>;

const COUNTRIES: Country[] = ["BG", "RO", "GR"];
const NONE: CountryWindows = { BG: null, RO: null, GR: null };

/**
 * Calculated delivery windows per variant and country (D-071): the supplier the batch job would
 * pick (D-063 B3), its next closing and transit days, then the courier days from the company
 * settings. Pre-orders and variants without an active offer get null — the product's own text
 * ("dispatch estimate") is shown instead.
 */
export async function deliveryWindows(
  db: Database,
  variantIds: readonly string[],
  now = new Date(),
): Promise<Map<string, CountryWindows>> {
  const result = new Map<string, CountryWindows>();
  if (variantIds.length === 0) return result;
  const [rows, company] = await Promise.all([
    db
      .select({
        variantId: supplierOffers.variantId,
        state: products.state,
        supplierId: suppliers.id,
        inEu: suppliers.inEu,
        unitCostCents: supplierOffers.unitCostCents,
        closeWeekdays: suppliers.closeWeekdays,
        closeHour: suppliers.closeHour,
        closeMinute: suppliers.closeMinute,
        minOrderCents: suppliers.minOrderCents,
        transitDaysMin: suppliers.transitDaysMin,
        transitDaysMax: suppliers.transitDaysMax,
      })
      .from(supplierOffers)
      .innerJoin(suppliers, eq(suppliers.id, supplierOffers.supplierId))
      .innerJoin(variants, eq(variants.id, supplierOffers.variantId))
      .innerJoin(products, eq(products.id, variants.productId))
      .where(
        and(
          inArray(supplierOffers.variantId, [...variantIds]),
          eq(supplierOffers.active, true),
          eq(suppliers.active, true),
        ),
      ),
    loadCompanySettings(db),
  ]);
  for (const variantId of variantIds) {
    const offers = rows.filter((r) => r.variantId === variantId);
    const offer = pickOffer(offers);
    // Pre-orders wait for the release; their date comes from the product's own text.
    if (!offer || offer.state === "PRE_ORDER" || offer.closeWeekdays.length === 0) {
      result.set(variantId, NONE);
      continue;
    }
    const windows = { ...NONE };
    for (const country of COUNTRIES) {
      windows[country] = estimateDelivery({
        now,
        schedule: { weekdays: offer.closeWeekdays, hour: offer.closeHour, minute: offer.closeMinute },
        transitDays: { min: offer.transitDaysMin, max: offer.transitDaysMax },
        courierDays: company.courierDays[country],
        minimumOrder: offer.minOrderCents > 0,
      });
    }
    result.set(variantId, windows);
  }
  return result;
}
