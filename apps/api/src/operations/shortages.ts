import type { DamageInput, Shortage } from "@kummie/contracts";
import { businessDay, formatMoney, refundOfUnits } from "@kummie/core";
import { t } from "@kummie/i18n";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import sharp from "sharp";
import type { Database } from "../db/client";
import { batchDamage, batches, batchLines, orderLines, orders, shortages, suppliers } from "../db/schema";
import { enqueue } from "../jobs/outbox";
import { orderNumber, type Tx } from "../shop/basics";
import { orderLink, type ShopDeps } from "../shop/orders";
import { PartialRefundError, refundUnits } from "../shop/partial-refund";
import { OperationsError, syncOrders, type OperationsDeps } from "./service";

/** Largest photo upload for a damage claim. */
export const MAX_DAMAGE_PHOTO_BYTES = 8 * 1024 * 1024;

async function receivingBatch(db: Database | Tx, batchId: string) {
  const [batch] = await db.select().from(batches).where(eq(batches.id, batchId));
  if (!batch) throw new OperationsError("not_found", "No such batch");
  if (batch.status !== "shipped" && batch.status !== "ordered")
    throw new OperationsError("not_allowed", "This batch is not being received");
  return batch;
}

/**
 * Damaged units of one supplier SKU while receiving (D-063 B5). Only the good units are counted as
 * received; these become "damaged" shortages when receiving is done. Qty 0 removes the record.
 */
export async function recordDamage(
  db: Database,
  batchId: string,
  input: DamageInput,
  staffId: string | null,
) {
  await receivingBatch(db, batchId);
  const [line] = await db
    .select({ id: batchLines.id })
    .from(batchLines)
    .where(and(eq(batchLines.batchId, batchId), eq(batchLines.supplierSku, input.supplierSku)))
    .limit(1);
  if (!line) throw new OperationsError("not_found", "No such product in this batch");
  if (input.qty === 0) {
    await db
      .delete(batchDamage)
      .where(and(eq(batchDamage.batchId, batchId), eq(batchDamage.supplierSku, input.supplierSku)));
    return;
  }
  await db
    .insert(batchDamage)
    .values({ batchId, supplierSku: input.supplierSku, qty: input.qty, note: input.note, createdBy: staffId })
    .onConflictDoUpdate({
      target: [batchDamage.batchId, batchDamage.supplierSku],
      set: { qty: input.qty, note: input.note, updatedAt: new Date() },
    });
}

/** The claim photo: re-encoded as JPEG (no EXIF/GPS), at most 1600 px. */
export async function saveDamagePhoto(db: Database, batchId: string, supplierSku: string, body: Uint8Array) {
  await receivingBatch(db, batchId);
  let photo: Buffer;
  try {
    photo = await sharp(body, { limitInputPixels: 50_000_000 })
      .rotate()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
  } catch {
    throw new OperationsError("mismatch", "This file is not a photo we can read");
  }
  const updated = await db
    .update(batchDamage)
    .set({ photo, updatedAt: new Date() })
    .where(and(eq(batchDamage.batchId, batchId), eq(batchDamage.supplierSku, supplierSku)))
    .returning({ id: batchDamage.id });
  if (updated.length === 0) throw new OperationsError("not_found", "Enter the damaged units first");
}

export async function damagePhoto(db: Database, damageId: string): Promise<Uint8Array | null> {
  const [row] = await db
    .select({ photo: batchDamage.photo })
    .from(batchDamage)
    .where(eq(batchDamage.id, damageId));
  return row?.photo ?? null;
}

/** The "Липси" list: open shortages first (oldest due first), then the last resolved ones. */
export async function listShortages(db: Database, today = businessDay(new Date())): Promise<Shortage[]> {
  const rows = await db
    .select({
      s: shortages,
      seq: orders.seq,
      shippingCents: orders.shippingCents,
      line: orderLines,
      supplierSku: batchLines.supplierSku,
      supplierName: suppliers.name,
      poReference: batches.poReference,
      note: batchDamage.note,
      hasPhoto: sql<boolean>`${batchDamage.photo} is not null`,
    })
    .from(shortages)
    .innerJoin(orders, eq(orders.id, shortages.orderId))
    .innerJoin(orderLines, eq(orderLines.id, shortages.orderLineId))
    .innerJoin(batchLines, eq(batchLines.id, shortages.batchLineId))
    .innerJoin(batches, eq(batches.id, shortages.batchId))
    .innerJoin(suppliers, eq(suppliers.id, batches.supplierId))
    .leftJoin(batchDamage, eq(batchDamage.id, shortages.damageId))
    .orderBy(sql`${shortages.status} = 'open' desc`, asc(shortages.dueOn), desc(shortages.createdAt))
    .limit(200);
  const orderIds = [...new Set(rows.map((r) => r.s.orderId))];
  const allLines = orderIds.length
    ? await db.select().from(orderLines).where(inArray(orderLines.orderId, orderIds))
    : [];
  return rows.map(
    ({ s, seq, shippingCents, line, supplierSku, supplierName, poReference, note, hasPhoto }) => {
      const left = allLines
        .filter((l) => l.orderId === s.orderId)
        .reduce((sum, l) => sum + l.qty - l.refundedQty, 0);
      const units = s.qty <= line.qty - line.refundedQty ? refundOfUnits(line, s.qty).totalCents : 0;
      return {
        id: s.id,
        kind: s.kind,
        status: s.status,
        qty: s.qty,
        dueOn: s.dueOn,
        due: today > s.dueOn,
        orderId: s.orderId,
        orderNumber: orderNumber(seq),
        sku: line.sku,
        title: line.title,
        version: line.version,
        supplierSku,
        supplierName,
        poReference,
        refundCents: units + (s.status === "open" && left === s.qty ? shippingCents : 0),
        claimSentAt: s.claimSentAt?.toISOString() ?? null,
        note,
        photoId: hasPhoto ? s.damageId : null,
        createdAt: s.createdAt.toISOString(),
      };
    },
  );
}

async function openShortage(db: Database | Tx, id: string) {
  const [row] = await db.select().from(shortages).where(eq(shortages.id, id));
  if (!row) throw new OperationsError("not_found", "No such shortage");
  if (row.status !== "open") throw new OperationsError("not_allowed", "This shortage is already resolved");
  return row;
}

/** The claim to the supplier was sent (with the photo for damaged units). */
export async function markClaimSent(db: Database, id: string) {
  await openShortage(db, id);
  await db
    .update(shortages)
    .set({ claimSentAt: new Date(), updatedAt: new Date() })
    .where(eq(shortages.id, id));
}

/** The supplier sent the units after all: they count as received and the order goes on. */
export async function markArrived(deps: OperationsDeps, id: string, actor: string) {
  await deps.db.transaction(async (tx) => {
    const short = await openShortage(tx, id);
    await tx
      .update(batchLines)
      .set({ receivedQty: sql`least(${batchLines.qty}, ${batchLines.receivedQty} + ${short.qty})` })
      .where(eq(batchLines.id, short.batchLineId));
    await tx
      .update(shortages)
      .set({ status: "arrived", resolvedAt: new Date(), resolvedBy: actor, updatedAt: new Date() })
      .where(eq(shortages.id, id));
    await syncOrders(deps, tx, [short.orderId]);
  });
  deps.kick?.();
}

/**
 * Staff confirm the partial refund (D-064): the card gets the units' price back (plus delivery when
 * nothing is left to ship), a storno and credit note are issued for those lines, the Kummies are
 * re-counted (D-032) and the customer gets an e-mail; the rest of the order ships.
 */
export async function refundShortage(shop: ShopDeps, ops: OperationsDeps, id: string, actor: string) {
  const short = await openShortage(shop.db, id);
  try {
    await refundUnits(shop, {
      orderId: short.orderId,
      items: [{ orderLineId: short.orderLineId, qty: short.qty }],
      reason: short.kind === "damaged" ? "damaged" : "shortage",
      idempotencyKey: `refund:shortage:${short.id}`,
      actor,
      documentReason:
        short.kind === "damaged" ? "повредени при доставката бройки" : "липсващи бройки от доставчика",
      onRecorded: async ({ tx, order, refundId, amountCents, whole, documentIds }) => {
        await tx
          .update(shortages)
          .set({
            status: "refunded",
            refundId,
            resolvedAt: new Date(),
            resolvedBy: actor,
            updatedAt: new Date(),
          })
          .where(eq(shortages.id, short.id));
        if (whole) return; // the "refunded" status e-mail already went out
        const [line] = await tx.select().from(orderLines).where(eq(orderLines.id, short.orderLineId));
        const locale = order.locale;
        const number = orderNumber(order.seq);
        const site = `${shop.webUrl.replace(/\/$/, "")}/${locale}`;
        const key = `order-shortage:${short.id}`;
        const amount = formatMoney(amountCents, locale);
        await enqueue(
          tx,
          "email",
          {
            to: order.email,
            subject: t(locale, "email.shortage.subject", { number, amount }),
            text: [
              t(locale, short.kind === "damaged" ? "email.shortage.damaged" : "email.shortage.missing", {
                name: order.address.name,
                number,
                item: `${line?.title} (${line?.version})`,
                qty: short.qty,
                amount,
                link: orderLink(shop, order),
              }),
              "",
              t(locale, "email.signoff", { site }),
            ].join("\n"),
            locale,
            category: "transactional",
            idempotencyKey: key,
            cta: { label: t(locale, "email.cta.order"), url: orderLink(shop, order) },
            documentIds,
          },
          key,
        );
        await syncOrders(ops, tx, [order.id]);
      },
    });
  } catch (error) {
    if (error instanceof PartialRefundError) throw new OperationsError(error.code, error.message);
    throw error;
  }
  ops.kick?.();
}
