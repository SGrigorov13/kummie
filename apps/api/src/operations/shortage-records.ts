import { addWorkingDays, businessDay, SHORTAGE_WAIT_WORKING_DAYS, shortfalls } from "@kummie/core";
import { asc, eq } from "drizzle-orm";
import { batchDamage, batchLines, shortages } from "../db/schema";
import type { Tx } from "../shop/basics";

/**
 * Receiving done: every unit a line did not get becomes an open shortage (damaged first, then
 * missing) with the supplier's 3 working days (D-063 B5). Runs inside the receiving transaction.
 */
export async function createShortages(tx: Tx, batchId: string, today = businessDay(new Date())) {
  const lines = await tx
    .select()
    .from(batchLines)
    .where(eq(batchLines.batchId, batchId))
    .orderBy(asc(batchLines.id));
  const damage = await tx.select().from(batchDamage).where(eq(batchDamage.batchId, batchId));
  const dueOn = addWorkingDays(today, SHORTAGE_WAIT_WORKING_DAYS);
  for (const sku of new Set(lines.map((l) => l.supplierSku))) {
    const skuLines = lines.filter((l) => l.supplierSku === sku);
    const damaged = damage.find((d) => d.supplierSku === sku);
    for (const short of shortfalls(skuLines, damaged?.qty ?? 0)) {
      const line = skuLines.find((l) => l.id === short.lineId);
      if (!line) continue;
      await tx
        .insert(shortages)
        .values({
          batchId,
          batchLineId: line.id,
          orderId: line.orderId,
          orderLineId: line.orderLineId,
          damageId: short.kind === "damaged" ? (damaged?.id ?? null) : null,
          kind: short.kind,
          qty: short.qty,
          dueOn,
        })
        .onConflictDoNothing();
    }
  }
}
