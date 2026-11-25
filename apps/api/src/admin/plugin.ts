import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { authRoutes } from "./auth-routes";
import type { AdminDeps } from "./context";
import { runtimeOf } from "./golive";
import { ordersAdminRoutes } from "./orders-routes";
import { salesRoutes } from "./sales-routes";
import { importRoutes } from "./import-routes";
import { productsAdminRoutes } from "./products-routes";
import { settingsRoutes } from "./settings-routes";

/**
 * Staff API under /admin-api. Cookie sessions (HTTP-only, SameSite=Strict), rate-limited sign-in,
 * mandatory TOTP 2FA, role checks and an audit log. Cookies, rate limiting and CORS (admin origins
 * only) are registered in app.ts.
 */
export function adminPlugin(deps: AdminDeps): FastifyPluginAsyncZod {
  return async (app) => {
    app.decorateRequest("staff", null);
    // Mutating staff requests must be JSON: forms from other sites cannot send that without CORS.
    app.addHook("preValidation", async (request, reply) => {
      if (!request.url.startsWith("/admin-api/") || request.method === "GET" || request.method === "OPTIONS")
        return;
      if (!String(request.headers["content-type"] ?? "").startsWith("application/json")) {
        return reply.code(415).send({ error: "unsupported_media_type", message: "Send JSON" });
      }
    });

    await app.register(authRoutes(deps));
    await app.register(settingsRoutes(deps));
    await app.register(productsAdminRoutes(deps));
    await app.register(importRoutes(deps));
    if (deps.shop) await app.register(ordersAdminRoutes({ ...deps, shop: deps.shop }));
    if (deps.shop) await app.register(salesRoutes({ ...deps, runtime: runtimeOf(deps.shop) }));
  };
}
