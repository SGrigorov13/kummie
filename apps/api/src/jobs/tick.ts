import { pathToFileURL } from "node:url";

/**
 * Run-once background worker. cPanel cron calls it every few minutes (ARCHITECTURE §2, §10):
 *   node dist/tick.js        (production)
 *   pnpm --filter api tick   (local)
 * Each job must be idempotent and finish within its time budget. M0 has no jobs yet; M1/M2 add
 * batch closing, notifications and emails backed by a `jobs` table in PostgreSQL.
 */

export type JobLogger = Pick<Console, "info" | "error">;

export type Job = {
  name: string;
  /** Time budget; a job still running after this is reported as failed and the tick moves on. */
  timeoutMs: number;
  run: (ctx: { now: Date; signal: AbortSignal; log: JobLogger }) => Promise<void>;
};

export type TickResult = { name: string; ok: boolean; ms: number; error?: string };

/** Registered jobs, in run order. Empty in M0. */
export const jobs: readonly Job[] = [];

export async function runTick(
  list: readonly Job[],
  log: JobLogger = console,
  now = new Date(),
): Promise<TickResult[]> {
  const results: TickResult[] = [];
  for (const job of list) {
    const started = Date.now();
    const controller = new AbortController();
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        job.run({ now, signal: controller.signal, log }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new Error(`timed out after ${job.timeoutMs}ms`));
          }, job.timeoutMs);
        }),
      ]);
      results.push({ name: job.name, ok: true, ms: Date.now() - started });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`[tick] ${job.name} failed: ${message}`);
      results.push({ name: job.name, ok: false, ms: Date.now() - started, error: message });
    } finally {
      clearTimeout(timer);
    }
  }
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runTick(jobs).then(
    (results) => {
      const failed = results.filter((result) => !result.ok).length;
      console.info(`[tick] ${results.length} job(s), ${failed} failed`);
      process.exit(failed > 0 ? 1 : 0);
    },
    (error: unknown) => {
      console.error(error);
      process.exit(1);
    },
  );
}
