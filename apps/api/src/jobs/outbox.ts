import { and, eq, inArray, lt, lte, or, sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { jobs } from "../db/schema";
import type { JobLogger } from "./types";

/** Gives up after this many attempts; the job stays as `failed` for a person to look at. */
export const MAX_ATTEMPTS = 6;
/** A claimed job whose worker died is picked up again after this. */
const LOCK_MINUTES = 5;

type Writer = Pick<Database, "insert">;

/** Queues work in the same transaction as the change that needs it. Same key twice → queued once. */
export async function enqueue(
  db: Writer,
  kind: string,
  payload: Record<string, unknown>,
  idempotencyKey: string,
  runAt: Date = new Date(),
): Promise<void> {
  await db.insert(jobs).values({ kind, payload, idempotencyKey, runAt }).onConflictDoNothing();
}

export type JobHandler = (
  payload: Record<string, unknown>,
  ctx: { db: Database; now: Date },
) => Promise<void>;

/** 1, 2, 4, 8, 16 minutes … between attempts. */
export function retryDelayMs(attempts: number): number {
  return 60_000 * 2 ** Math.max(0, attempts - 1);
}

/**
 * Runs due jobs. A finished job keeps only its key: the payload (e.g. an e-mail with an address)
 * is cleared, so the outbox does not become a second copy of personal data.
 * Safe to call from several processes at once: rows are claimed with
 * FOR UPDATE SKIP LOCKED, and a claim expires if the worker dies.
 */
export async function processDueJobs(
  db: Database,
  handlers: Readonly<Record<string, JobHandler>>,
  { now = new Date(), log = console as JobLogger, limit = 20 } = {},
): Promise<{ done: number; failed: number }> {
  const kinds = Object.keys(handlers);
  if (kinds.length === 0) return { done: 0, failed: 0 };
  const claimed = await db.transaction(async (tx) => {
    const due = await tx
      .select({ id: jobs.id })
      .from(jobs)
      .where(
        and(
          inArray(jobs.kind, kinds),
          or(
            and(eq(jobs.status, "pending"), lte(jobs.runAt, now)),
            and(eq(jobs.status, "running"), lt(jobs.lockedUntil, now)),
          ),
        ),
      )
      .orderBy(jobs.runAt)
      .limit(limit)
      .for("update", { skipLocked: true });
    if (due.length === 0) return [];
    return tx
      .update(jobs)
      .set({
        status: "running",
        attempts: sql`${jobs.attempts} + 1`,
        lockedUntil: new Date(now.getTime() + LOCK_MINUTES * 60_000),
      })
      .where(
        inArray(
          jobs.id,
          due.map((row) => row.id),
        ),
      )
      .returning();
  });

  let done = 0;
  let failed = 0;
  for (const job of claimed) {
    const handler = handlers[job.kind];
    try {
      if (!handler) throw new Error(`no handler for ${job.kind}`);
      await handler(job.payload, { db, now });
      await db
        .update(jobs)
        .set({ status: "done", doneAt: new Date(), lastError: null, payload: {} })
        .where(eq(jobs.id, job.id));
      done += 1;
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      const giveUp = job.attempts >= MAX_ATTEMPTS;
      log.error(`[jobs] ${job.kind} ${job.id} attempt ${job.attempts} failed: ${message}`);
      await db
        .update(jobs)
        .set({
          status: giveUp ? "failed" : "pending",
          lastError: message.slice(0, 1000),
          runAt: new Date(now.getTime() + retryDelayMs(job.attempts)),
          lockedUntil: null,
        })
        .where(eq(jobs.id, job.id));
    }
  }
  return { done, failed };
}
