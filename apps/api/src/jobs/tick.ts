import { pathToFileURL } from "node:url";
import type { Job, JobLogger, JobSchedule, TickResult } from "./types";

export type { Job, JobLogger, JobSchedule, TickResult } from "./types";

/**
 * Run-once background worker, started by cPanel cron (ARCHITECTURE §2, §10):
 *   every 5 minutes:  node dist/tick.js            (local: pnpm --filter api tick)
 *   daily at 06:00:   node dist/tick.js --daily    (local: pnpm --filter api tick:daily)
 * Each job must be idempotent and finish within its time budget. The process exits with code 1
 * when a job fails, so cron's e-mailed output works as the alert.
 */

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

export function jobsFor(list: readonly Job[], schedule: JobSchedule): Job[] {
  return list.filter((job) => job.schedule === schedule);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const schedule: JobSchedule = process.argv.includes("--daily") ? "daily" : "frequent";
  import("./registry")
    .then(({ jobs }) => runTick(jobsFor(jobs, schedule)))
    .then(
      (results) => {
        const failed = results.filter((result) => !result.ok).length;
        console.info(`[tick:${schedule}] ${results.length} job(s), ${failed} failed`);
        process.exit(failed > 0 ? 1 : 0);
      },
      (error: unknown) => {
        console.error(error);
        process.exit(1);
      },
    );
}
