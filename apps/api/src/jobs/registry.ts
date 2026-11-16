import { accountJobHandlers } from "../accounts/erasure";
import type { EmailAdapter } from "../adapters/email";
import type { Database } from "../db/client";
import { processDueJobs } from "./outbox";
import type { Job } from "./types";
import { vatRateCheckJob } from "./vat-rates";

/** Jobs that need no database. */
export const jobs: readonly Job[] = [vatRateCheckJob()];

/**
 * All background jobs, in run order. With a database the outbox (e-mails, account erasure) runs on
 * every tick; M1/M2 add batch closing and notifications.
 */
export function createJobs(deps: { db?: Database; email?: EmailAdapter } = {}): Job[] {
  const list: Job[] = [...jobs];
  if (deps.db && deps.email) {
    const { db, email } = deps;
    list.push({
      name: "outbox",
      schedule: "frequent",
      timeoutMs: 120_000,
      run: async ({ now, log }) => {
        const { done, failed } = await processDueJobs(db, accountJobHandlers(email), { now, log, limit: 50 });
        log.info(`[outbox] ${done} done, ${failed} failed`);
        if (failed > 0) throw new Error(`${failed} job(s) failed; they are retried with backoff`);
      },
    });
  }
  return list;
}
