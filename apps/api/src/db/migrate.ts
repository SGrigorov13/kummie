import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { loadConfig } from "../config";
import { createDatabase } from "./client";

/**
 * Applies pending Drizzle migrations from ./drizzle. Run locally with `pnpm --filter api db:migrate`
 * and in deploys with `node dist/migrate.js` (M1).
 */
export async function runMigrations(): Promise<void> {
  const config = loadConfig();
  if (!config.DATABASE_URL) throw new Error("DATABASE_URL is not set. Copy apps/api/.env.example to apps/api/.env.");
  const handle = createDatabase(config.DATABASE_URL, 1);
  try {
    const migrationsFolder = resolve(process.cwd(), config.MIGRATIONS_DIR);
    await migrate(handle.db, { migrationsFolder });
    console.log(`Migrations applied from ${migrationsFolder}`);
  } finally {
    await handle.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runMigrations().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
