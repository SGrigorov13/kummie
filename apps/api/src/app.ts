import Fastify, { type FastifyServerOptions } from "fastify";
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from "fastify-type-provider-zod";
import type { CatalogueRepository } from "./catalogue/repository";
import { catalogueRoutes } from "./routes/catalogue";
import { healthRoutes, type DbCheck } from "./routes/health";

export type AppDeps = {
  logger: FastifyServerOptions["logger"];
  checkDb: DbCheck;
  /** Registered only when a database is configured. */
  catalogue?: CatalogueRepository;
};

/** Builds the Fastify app with Zod validation/serialisation. No listening here, so tests can inject. */
export function buildApp({ logger, checkDb, catalogue }: AppDeps) {
  const app = Fastify({ logger }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.register(healthRoutes(checkDb));
  if (catalogue) app.register(catalogueRoutes(catalogue));
  return app;
}
