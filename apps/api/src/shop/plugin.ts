import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { browserWriteGuard } from "../http/browser-guard";
import type { ShopDeps } from "./orders";
import { paymentRoutes } from "./payment-routes";
import { shopRoutes } from "./routes";

/**
 * Cart, checkout and orders for the shop (M1 Tasks 6–7), plus payment webhooks. Browser routes get
 * the CSRF guard; webhooks come from the provider and are checked by signature instead.
 */
export function shopPlugin(deps: ShopDeps): FastifyPluginAsyncZod {
  return async (app) => {
    await app.register(async (browser) => {
      browser.addHook("preValidation", browserWriteGuard(deps.allowedOrigins));
      await browser.register(shopRoutes(deps));
    });
    await app.register(paymentRoutes(deps));
  };
}
