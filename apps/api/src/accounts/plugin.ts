import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { accountRoutes } from "./account-routes";
import { customerAuthRoutes } from "./auth-routes";
import type { AccountDeps } from "./context";

/**
 * Customer accounts under /auth and /account (M1 Task 4). Cookie sessions (HTTP-only, SameSite=Lax),
 * rate-limited sign-in, e-mail verification, password reset, GDPR export and deletion.
 * CSRF: writes must be JSON and, when the browser sends an Origin, come from the shop's origins.
 */
export function accountsPlugin(deps: AccountDeps): FastifyPluginAsyncZod {
  return async (app) => {
    app.decorateRequest("customer", null);

    app.addHook("preValidation", async (request, reply) => {
      if (request.method === "GET" || request.method === "OPTIONS" || request.method === "HEAD") return;
      const origin = request.headers.origin;
      if (origin && !deps.allowedOrigins.includes(origin)) {
        return reply.code(403).send({ error: "forbidden_origin", message: "Not allowed from this site" });
      }
      const hasBody =
        Number(request.headers["content-length"] ?? 0) > 0 || !!request.headers["transfer-encoding"];
      if (request.method === "DELETE" && !hasBody) return;
      if (!String(request.headers["content-type"] ?? "").startsWith("application/json")) {
        return reply.code(415).send({ error: "unsupported_media_type", message: "Send JSON" });
      }
    });

    await app.register(customerAuthRoutes(deps));
    await app.register(accountRoutes(deps));
  };
}
