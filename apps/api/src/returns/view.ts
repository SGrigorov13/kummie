import type { OrderDetail } from "@kummie/contracts";
import { businessDay, returnableQty, returnNumber, withdrawalUntil } from "@kummie/core";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { Database } from "../db/client";
import { orderEvents, orderLines, returnLines, returns } from "../db/schema";
import type { OrderRow, Tx } from "../shop/basics";

type LineRow = typeof orderLines.$inferSelect;
export const OPEN: ("requested" | "received")[] = ["requested", "received"];

/** The day (Sofia) the order reached the customer, from its history. */
async function deliveredDay(db: Database | Tx, orderId: string): Promise<string | null> {
  const [event] = await db
    .select({ at: orderEvents.at })
    .from(orderEvents)
    .where(and(eq(orderEvents.orderId, orderId), eq(orderEvents.toStatus, "delivered")))
    .orderBy(asc(orderEvents.at))
    .limit(1);
  return event ? businessDay(event.at) : null;
}

/** Units of each line already in a return that is not closed yet. */
export async function unitsInOpenReturns(db: Database | Tx, orderId: string): Promise<Map<string, number>> {
  const rows = await db
    .select({ lineId: returnLines.orderLineId, qty: returnLines.qty })
    .from(returnLines)
    .innerJoin(returns, eq(returns.id, returnLines.returnId))
    .where(and(eq(returns.orderId, orderId), inArray(returns.status, OPEN)));
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.lineId, (map.get(r.lineId) ?? 0) + r.qty);
  return map;
}

/** "Откажи се" in the order: open 14 days after delivery while something can still go back. */
export async function withdrawalInfo(
  db: Database,
  order: OrderRow,
  lines: readonly LineRow[],
  now = new Date(),
): Promise<OrderDetail["withdrawal"]> {
  if (order.status !== "delivered") return null;
  const day = await deliveredDay(db, order.id);
  if (!day) return null;
  const until = withdrawalUntil(day);
  if (businessDay(now) > until) return null;
  const open = await unitsInOpenReturns(db, order.id);
  const returnable = lines
    .map((l) => ({
      orderLineId: l.id,
      title: l.title,
      version: l.version,
      returnableQty: returnableQty(l, open.get(l.id) ?? 0),
    }))
    .filter((l) => l.returnableQty > 0);
  return returnable.length > 0 ? { until, lines: returnable } : null;
}

/** The order's returns as the customer sees them. */
export async function orderReturns(db: Database, orderId: string): Promise<OrderDetail["returns"]> {
  const rows = await db.select().from(returns).where(eq(returns.orderId, orderId)).orderBy(asc(returns.seq));
  if (rows.length === 0) return [];
  const lines = await db
    .select({ rl: returnLines, title: orderLines.title, version: orderLines.version })
    .from(returnLines)
    .innerJoin(orderLines, eq(orderLines.id, returnLines.orderLineId))
    .where(
      inArray(
        returnLines.returnId,
        rows.map((r) => r.id),
      ),
    );
  return rows.map((r) => ({
    number: returnNumber(r.seq),
    status: r.status,
    courier: r.courier,
    createdAt: r.createdAt.toISOString(),
    refundDueOn: r.refundDueOn,
    lines: lines
      .filter((l) => l.rl.returnId === r.id)
      .map((l) => ({
        title: l.title,
        version: l.version,
        qty: l.rl.qty,
        decision: l.rl.decision,
        refuseReason: l.rl.refuseReason,
      })),
  }));
}
