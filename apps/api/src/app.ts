import cors from "@fastify/cors";
import Fastify, { type FastifyServerOptions } from "fastify";
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from "fastify-type-provider-zod";
import { adminPlugin } from "./admin/plugin";
import type { AdminDeps } from "./admin/context";
import type { CatalogueRepository } from "./catalogue/repository";
import { catalogueRoutes } from "./routes/catalogue";
import { healthRoutes, type DbCheck } from "./routes/health";

export type AppDeps = {
  logger: FastifyServerOptions["logger"];
  checkDb: DbCheck;
  /** Registered only when a database is configured. */
  catalogue?: CatalogueRepository;
  /** Staff API; registered only with a database and STAFF_SECRET_KEY. */
  admin?: AdminDeps;
};

/** Builds the Fastify app with Zod validation/serialisation. No listening here, so tests can inject. */
export function buildApp({ logger, checkDb, catalogue, admin }: AppDeps) {
  const app = Fastify({ logger }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  // Browsers may call the API with cookies only from the admin app's origins (public pages are
  // rendered by the web server, which needs no CORS).
  if (admin) {
    app.register(cors, { origin: admin.allowedOrigins, credentials: true, methods: ["GET", "POST", "PUT"] });
  }
  app.register(healthRoutes(checkDb));
  if (catalogue) app.register(catalogueRoutes(catalogue));
  if (admin) app.register(adminPlugin(admin));
  return app;
}
