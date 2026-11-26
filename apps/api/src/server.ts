import { resolve } from "node:path";
import { accountJobHandlers } from "./accounts/erasure";
import { DiskStorage } from "./adapters/disk-storage";
import { FakeCarrier } from "./adapters/fake-carrier";
import { FileSupplierAdapter } from "./adapters/fake-supplier";
import { buildApp } from "./app";
import { createSecretBox } from "./auth/crypto";
import { createPgCatalogueRepository } from "./catalogue/pg-repository";
import { loadConfig, mediaBaseUrl, originList, trustProxyOption } from "./config";
import { createDatabase, type DatabaseHandle } from "./db/client";
import { FakePaymentProvider } from "./adapters/fake-payment";
import { createEmailAdapter } from "./email/factory";
import { processDueJobs } from "./jobs/outbox";
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

  const mediaUrlBase = mediaBaseUrl(config);
  const media = new DiskStorage(resolve(process.cwd(), config.MEDIA_DIR), mediaUrlBase);
  const catalogue = database ? createPgCatalogueRepository(database.db, mediaUrlBase) : undefined;
  const cookieSecure = config.COOKIE_SECURE
    ? config.COOKIE_SECURE === "true"
    : config.NODE_ENV === "production";
  const email = createEmailAdapter(config);
  let draining = false;
  const accounts = database
    ? {
        db: database.db,
        email,
        webUrl: config.WEB_URL,
        allowedOrigins: originList(config.WEB_ORIGINS),
        cookieSecure,
        // Sends queued e-mails right away; the tick cron is the safety net for anything left.
        kick: () => {
          if (draining) return;
          draining = true;
          processDueJobs(database.db, accountJobHandlers(email), { log: app.log })
            .catch((error: unknown) => app.log.error({ err: error }, "outbox run failed"))
            .finally(() => {
              draining = false;
            });
        },
      }
    : undefined;
  const fakePayments = new FakePaymentProvider(
    `${config.API_URL.replace(/\/$/, "")}/fake-pay`,
    config.FAKE_PAYMENT_SECRET,
  );
  const shop = accounts ? { ...accounts, payments: fakePayments, fakePayments } : undefined;
  // M2 with test partners until the distributor and courier agreements (docs/specs/M2-operations.md).
  const operations = shop
    ? {
        db: shop.db,
        webUrl: config.WEB_URL,
        supplier: new FileSupplierAdapter(resolve(process.cwd(), config.PO_OUTBOX_DIR)),
        carriers: [new FakeCarrier()],
        kick: shop.kick,
      }
    : undefined;
  const admin =
    database && config.STAFF_SECRET_KEY
      ? {
          db: database.db,
          secretBox: createSecretBox(config.STAFF_SECRET_KEY),
          allowedOrigins: originList(config.ADMIN_ORIGINS),
          cookieSecure,
          storage: media,
          ...(operations ? { operations } : {}),
          ...(shop ? { shop } : {}),
        }
      : undefined;
  const app = buildApp({
    logger,
    checkDb,
    catalogue,
    admin,
    accounts,
    shop,
    media,
    trustProxy: trustProxyOption(config.TRUST_PROXY),
  });
  if (config.NODE_ENV === "production" && config.EMAIL_TRANSPORT === "file")
    app.log.warn("EMAIL_TRANSPORT=file in production — e-mails are written to disk, not sent");
  if (database && !admin) app.log.warn("STAFF_SECRET_KEY is not set — the staff API (admin panel) is off");
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
