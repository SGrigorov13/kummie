import type { Job } from "./types";
import { vatRateCheckJob } from "./vat-rates";

/** All background jobs, in run order. M1/M2 add batch closing, notifications and emails. */
export const jobs: readonly Job[] = [vatRateCheckJob()];
