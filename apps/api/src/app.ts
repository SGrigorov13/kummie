import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyServerOptions } from "fastify";
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from "fastify-type-provider-zod";
import type { AccountDeps } from "./accounts/context";
import type { StorageAdapter } from "./adapters/storage";
import { accountsPlugin } from "./accounts/plugin";
import type { AdminDeps } from "./admin/context";
import { adminPlugin } from "./admin/plugin";
import type { CatalogueRepository } from "./catalogue/repository";
import { catalogueRoutes } from "./routes/catalogue";
import type { ShopDeps } from "./shop/orders";
import { shopPlugin } from "./shop/plugin";
import { healthRoutes, type DbCheck } from "./routes/health";
import { mediaRoutes } from "./routes/media";
import { siteRoutes } from "./routes/site";

export type AppDeps = {
  logger: FastifyServerOptions["logger"];
  checkDb: DbCheck;
  /** Registered only when a database is configured. */
  catalogue?: CatalogueRepository;
  /** Staff API; registered only with a database and STAFF_SECRET_KEY. */
  admin?: AdminDeps;
  /** Customer accounts; registered only with a database. */
  accounts?: AccountDeps;
  /** Cart, checkout, orders and payment webhooks; registered only with a database. */
  shop?: ShopDeps;
  /** Product photo files, served under /media. */
  media?: StorageAdapter;
  /** Proxies in front of the API whose X-Forwarded-For is trusted (for rate limits by client IP). */
  trustProxy?: FastifyServerOptions["trustProxy"];
};

/** Builds the Fastify app with Zod validation/serialisation. No listening here, so tests can inject. */
export function buildApp({
  logger,
  checkDb,
  catalogue,
  admin,
  accounts,
  shop,
  media,
  trustProxy = false,
}: AppDeps) {
  // Signed payment session ids travel in the path (fake provider page), so allow longer segments.
  const app = Fastify({ logger, trustProxy, maxParamLength: 2048 }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.register(cookie);
  app.register(rateLimit, { global: false });

  // Browsers may send cookies only from our own apps: the staff API answers the admin origins only,
  // everything else the shop's origins (and the admin, which reads the public catalogue).
  const adminOrigins = admin?.allowedOrigins ?? [];
  const webOrigins = accounts?.allowedOrigins ?? shop?.allowedOrigins ?? [];
  if (adminOrigins.length > 0 || webOrigins.length > 0) {
    app.register(cors, {
      delegator: (request, callback) => {
        const staffRoute = request.url.startsWith("/admin-api/");
        callback(null, {
          origin: staffRoute ? adminOrigins : [...webOrigins, ...adminOrigins],
          credentials: true,
          methods: ["GET", "POST", "PUT", "DELETE"],
        });
      },
    });
  }

  app.register(healthRoutes(checkDb));
  if (media) app.register(mediaRoutes(media));
  if (catalogue) app.register(catalogueRoutes(catalogue));
  if (admin) app.register(adminPlugin(admin));
  if (accounts) app.register(accountsPlugin(accounts));
  if (shop) app.register(shopPlugin(shop));
  if (shop) app.register(siteRoutes(shop));
  return app;
}
