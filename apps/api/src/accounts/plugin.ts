import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { browserWriteGuard } from "../http/browser-guard";
import { accountRoutes } from "./account-routes";
import { customerAuthRoutes } from "./auth-routes";
import type { AccountDeps } from "./context";

/**
 * Customer accounts under /auth and /account (M1 Task 4). Cookie sessions (HTTP-only, SameSite=Lax),
 * rate-limited sign-in, e-mail verification, password reset, GDPR export and deletion.
 */
export function accountsPlugin(deps: AccountDeps): FastifyPluginAsyncZod {
  return async (app) => {
    app.decorateRequest("customer", null);
    app.addHook("preValidation", browserWriteGuard(deps.allowedOrigins));
    await app.register(customerAuthRoutes(deps));
    await app.register(accountRoutes(deps));
  };
}
