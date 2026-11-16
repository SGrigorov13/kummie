import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { authRoutes } from "./auth-routes";
import type { AdminDeps } from "./context";
import { productsAdminRoutes } from "./products-routes";
import { settingsRoutes } from "./settings-routes";

/**
 * Staff API under /admin-api. Cookie sessions (HTTP-only, SameSite=Strict), CORS only for the admin
 * app's origins, rate-limited sign-in, mandatory TOTP 2FA, role checks and an audit log.
 */
export function adminPlugin(deps: AdminDeps): FastifyPluginAsyncZod {
  return async (app) => {
    app.decorateRequest("staff", null);
    await app.register(cookie);
    await app.register(cors, {
      origin: deps.allowedOrigins,
      credentials: true,
      methods: ["GET", "POST", "PUT"],
    });
    await app.register(rateLimit, { global: false });

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
  };
}
