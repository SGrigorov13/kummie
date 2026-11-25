import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { ACCEPTED_TYPES } from "../media/images";
import { authRoutes } from "./auth-routes";
import type { AdminDeps } from "./context";
import { runtimeOf } from "./golive";
import { ordersAdminRoutes } from "./orders-routes";
import { salesRoutes } from "./sales-routes";
import { imagesRoutes } from "./images-routes";
import { importRoutes } from "./import-routes";
import { productsAdminRoutes } from "./products-routes";
import { settingsRoutes } from "./settings-routes";

const PHOTO_UPLOAD = /^\/admin-api\/products\/[0-9a-f-]{36}\/images$/;
const isAcceptedImageType = (type: string) =>
  (ACCEPTED_TYPES as readonly string[]).includes(type.split(";")[0]?.trim() ?? "");

/**
 * Staff API under /admin-api. Cookie sessions (HTTP-only, SameSite=Strict), rate-limited sign-in,
 * mandatory TOTP 2FA, role checks and an audit log. Cookies, rate limiting and CORS (admin origins
 * only) are registered in app.ts.
 */
export function adminPlugin(deps: AdminDeps): FastifyPluginAsyncZod {
  return async (app) => {
    app.decorateRequest("staff", null);
    // Mutating staff requests must be JSON (or, for a photo upload, an image type): forms from other
    // sites cannot send either without passing CORS. DELETE without a body is allowed.
    app.addHook("preValidation", async (request, reply) => {
      if (!request.url.startsWith("/admin-api/") || request.method === "GET" || request.method === "OPTIONS")
        return;
      const type = String(request.headers["content-type"] ?? "");
      if (type.startsWith("application/json")) return;
      if (request.method === "DELETE" && !type && !Number(request.headers["content-length"] ?? 0)) return;
      if (request.method === "POST" && PHOTO_UPLOAD.test(request.url) && isAcceptedImageType(type)) return;
      return reply.code(415).send({ error: "unsupported_media_type", message: "Send JSON" });
    });

    await app.register(authRoutes(deps));
    await app.register(settingsRoutes(deps));
    await app.register(productsAdminRoutes(deps));
    await app.register(importRoutes(deps));
    if (deps.storage) await app.register(imagesRoutes({ ...deps, storage: deps.storage }));
    if (deps.shop) await app.register(ordersAdminRoutes({ ...deps, shop: deps.shop }));
    if (deps.shop) await app.register(salesRoutes({ ...deps, runtime: runtimeOf(deps.shop) }));
  };
}
