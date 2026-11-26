import { accountJobHandlers } from "../accounts/erasure";
import type { EmailAdapter } from "../adapters/email";
import type { Database } from "../db/client";
import { runOperations, type OperationsDeps } from "../operations/service";
import { processDueJobs } from "./outbox";
import type { Job } from "./types";
import { vatRateCheckJob } from "./vat-rates";

/** Jobs that need no database. */
export const jobs: readonly Job[] = [vatRateCheckJob()];

/**
 * All background jobs, in run order. With a database the outbox (e-mails, account erasure) runs on
 * every tick; M1/M2 add batch closing and notifications.
 */
export function createJobs(
  deps: { db?: Database; email?: EmailAdapter; operations?: OperationsDeps } = {},
): Job[] {
  const list: Job[] = [...jobs];
  // Operations first, so the e-mails they queue go out in the same tick.
  if (deps.operations) {
    const operations = deps.operations;
    list.push({
      name: "operations",
      schedule: "frequent",
      timeoutMs: 120_000,
      run: async ({ now, log }) => {
        const result = await runOperations(operations, now);
        log.info(
          `[operations] ${result.assigned} order(s) into batches, ${result.closed} batch(es) sent, ${result.tracked} parcel update(s)`,
        );
        if (result.waitingWithoutOffer.length > 0)
          log.info(`[operations] waiting without a supplier offer: ${result.waitingWithoutOffer.join(", ")}`);
      },
    });
  }
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
