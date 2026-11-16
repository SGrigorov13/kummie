export type JobLogger = Pick<Console, "info" | "error">;

/**
 * "frequent": every tick (cPanel cron every 5 minutes).
 * "daily": only when the tick runs with --daily (a separate cron line, 06:00).
 */
export type JobSchedule = "frequent" | "daily";

export type Job = {
  name: string;
  schedule: JobSchedule;
  /** Time budget; a job still running after this is reported as failed and the tick moves on. */
  timeoutMs: number;
  run: (ctx: { now: Date; signal: AbortSignal; log: JobLogger }) => Promise<void>;
};

export type TickResult = { name: string; ok: boolean; ms: number; error?: string };
