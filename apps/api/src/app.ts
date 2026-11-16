import Fastify, { type FastifyServerOptions } from "fastify";
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from "fastify-type-provider-zod";
import { healthRoutes, type DbCheck } from "./routes/health";

export type AppDeps = {
  logger: FastifyServerOptions["logger"];
  checkDb: DbCheck;
};

/** Builds the Fastify app with Zod validation/serialisation. No listening here, so tests can inject. */
export function buildApp({ logger, checkDb }: AppDeps) {
  const app = Fastify({ logger }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.register(healthRoutes(checkDb));
  return app;
}
