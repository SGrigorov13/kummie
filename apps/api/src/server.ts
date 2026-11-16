import { buildApp } from "./app";
import { createPgCatalogueRepository } from "./catalogue/pg-repository";
import { loadConfig } from "./config";
import { createDatabase, type DatabaseHandle } from "./db/client";
import type { DbCheck } from "./routes/health";

/**
 * Entry point: `node dist/server.js` (cPanel Passenger) or `pnpm --filter api dev`.
 * Reads PORT from the environment, logs JSON with Pino (pretty in development).
 */
async function main() {
  const config = loadConfig();
  const pretty = config.NODE_ENV === "development";
  const logger = {
    level: config.LOG_LEVEL,
    ...(pretty ? { transport: { target: "pino-pretty", options: { translateTime: "SYS:HH:MM:ss" } } } : {}),
  };

  const database: DatabaseHandle | undefined = config.DATABASE_URL
    ? createDatabase(config.DATABASE_URL, config.DB_POOL_MAX)
    : undefined;

  const checkDb: DbCheck = async () => {
    if (!database) return "not_configured";
    try {
      await database.ping();
      return "ok";
    } catch (error) {
      app.log.warn({ err: error }, "database health check failed");
      return "error";
    }
  };

  const catalogue = database ? createPgCatalogueRepository(database.db, config.MEDIA_BASE_URL) : undefined;
  const app = buildApp({ logger, checkDb, catalogue });
  if (!database)
    app.log.warn(
      "DATABASE_URL is not set — /health will report db: not_configured (see apps/api/.env.example)",
    );

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "shutting down");
    await app.close();
    await database?.close();
    process.exit(0);
  };
  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));

  await app.listen({ port: config.PORT, host: config.HOST });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
