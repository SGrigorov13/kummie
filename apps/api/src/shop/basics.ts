import type { Database } from "../db/client";
import type { orders } from "../db/schema";

/** Shared by orders, lifecycle and documents (kept apart so they do not import each other). */
export type OrderRow = typeof orders.$inferSelect;
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Running number for people: KUM-1001, KUM-1002 … */
export const orderNumber = (seq: number | null) => `KUM-${seq ?? 0}`;
