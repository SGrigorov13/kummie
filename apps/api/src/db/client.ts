import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

export type DatabaseHandle = {
  db: Database;
  pool: pg.Pool;
  /** Resolves when `select 1` succeeds within the timeout, rejects otherwise. */
  ping: (timeoutMs?: number) => Promise<void>;
  close: () => Promise<void>;
};

export function createDatabase(url: string, poolMax: number): DatabaseHandle {
  const pool = new pg.Pool({
    connectionString: url,
    max: poolMax,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  const db = drizzle(pool, { schema });
  return {
    db,
    pool,
    ping: async (timeoutMs = 2_000) => {
      let timer: NodeJS.Timeout | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`database ping timed out after ${timeoutMs}ms`)), timeoutMs);
      });
      try {
        await Promise.race([db.execute(sql`select 1`), timeout]);
      } finally {
        clearTimeout(timer);
      }
    },
    close: () => pool.end(),
  };
}
