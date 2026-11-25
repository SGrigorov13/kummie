import { TraderInfo } from "@kummie/contracts";
import { FREE_SHIPPING_FROM_CENTS, SHIPPING_COUNTRIES } from "@kummie/core";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { loadCompanySettings } from "../admin/settings-routes";
import { loadSalesReadiness, runtimeOf } from "../admin/golive";
import type { ShopDeps } from "../shop/orders";

/** Public trader data and delivery terms (ЗЗП, A4, A5) — only what must be shown, never the IBAN. */
export function siteRoutes(shop: ShopDeps): FastifyPluginAsyncZod {
  const { db } = shop;
  return async (app) => {
    app.get("/site/trader", { schema: { response: { 200: TraderInfo } } }, async (_request, reply) => {
      const [company, readiness] = await Promise.all([
        loadCompanySettings(db),
        loadSalesReadiness(db, runtimeOf(shop)),
      ]);
      reply.header("cache-control", "public, max-age=60");
      return {
        legalName: company.legalName,
        eik: company.eik,
        vatNumber: company.vatNumber,
        address: company.registeredAddress,
        email: company.contactEmail,
        phone: company.contactPhone,
        eShopNumber: company.napEShopNumber ?? company.napRfNumber,
        salesMode: readiness.mode,
        delivery: {
          fees: SHIPPING_COUNTRIES.map((country) => ({
            country,
            feeCents: company.deliveryFeesCents[country],
          })),
          freeFromCents: FREE_SHIPPING_FROM_CENTS,
        },
      };
    });
  };
}
