import type {
  BatchDetail,
  BatchSummary,
  HubAddress,
  PackingSlip,
  PackInput,
  PackOrder,
} from "@kummie/contracts";
import {
  BATCH_ORDER_STATUSES,
  consolidateLines,
  customerSeesChange,
  nextBatchCloseAt,
  ORDER_STATUSES,
  orderProgressFromBatches,
  pickOffer,
  purchaseOrderCsv,
  purchaseOrderReference,
  purchaseOrderTotalCents,
  type OrderStatus,
  waitForMinimum,
} from "@kummie/core";
import { and, asc, desc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type { CarrierAdapter, TrackingStatus } from "../adapters/carrier";
import type { SupplierAdapter } from "../adapters/supplier";
import type { Database } from "../db/client";
import {
  batchDamage,
  batches,
  batchLines,
  orderLines,
  orders,
  parcels,
  productCompliance,
  settings,
  supplierOffers,
  suppliers,
  variants,
} from "../db/schema";
import { orderNumber, type OrderRow, type Tx } from "../shop/basics";
import { queueStatusEmail } from "../shop/lifecycle";
import { transition } from "../shop/orders";

/** Everything the operations need: the database, the test or real partners and the shop address. */
import { createShortages } from "./shortage-records";
export type OperationsDeps = {
  db: Database;
  /** For links in the status e-mails. */
  webUrl: string;
  supplier: SupplierAdapter;
  carriers: readonly CarrierAdapter[];
  /** Sends queued e-mails right away (the tick is the safety net). */
  kick?: () => void;
};

export class OperationsError extends Error {
  constructor(
    readonly code: "not_found" | "not_allowed" | "mismatch" | "no_carrier" | "no_hub" | "refund_failed",
    message: string,
  ) {
    super(message);
    this.name = "OperationsError";
  }
}

const OPERATIONS_KEY = "operations";
/** Re-check a parcel with the courier at most every 30 minutes. */
const TRACK_EVERY_MS = 30 * 60_000;

export async function readHubAddress(db: Database | Tx): Promise<HubAddress | null> {
  const [row] = await db.select().from(settings).where(eq(settings.key, OPERATIONS_KEY));
  return ((row?.value as { hub?: HubAddress | null } | undefined)?.hub ?? null) as HubAddress | null;
}

export async function writeHubAddress(db: Database, hub: HubAddress, staffId: string | null) {
  await db
    .insert(settings)
    .values({ key: OPERATIONS_KEY, value: { hub }, updatedBy: staffId })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: { hub }, updatedAt: new Date(), updatedBy: staffId },
    });
}

/** Moves an order forward (never back) and e-mails the customer when they see a new step. */
async function advance(deps: OperationsDeps, tx: Tx, order: OrderRow, to: OrderStatus, data = {}) {
  if (ORDER_STATUSES.indexOf(to) <= ORDER_STATUSES.indexOf(order.status)) return false;
  await transition(tx, order, to, "system", "operations", data);
  if (customerSeesChange(order.status, to)) await queueStatusEmail(deps, tx, order, to);
  return true;
}

/** Re-computes the status of orders from their batch lines (B10). */
export async function syncOrders(deps: OperationsDeps, tx: Tx, orderIds: readonly string[]) {
  if (orderIds.length === 0) return;
  // Units refunded instead of shipped (D-064) are no longer waited for.
  const rows = await tx
    .select({
      orderId: batchLines.orderId,
      batchStatus: batches.status,
      qty: sql<number>`greatest(${batchLines.qty} - ${orderLines.refundedQty}, 0)::int`,
      receivedQty: batchLines.receivedQty,
    })
    .from(batchLines)
    .innerJoin(batches, eq(batches.id, batchLines.batchId))
    .innerJoin(orderLines, eq(orderLines.id, batchLines.orderLineId))
    .where(inArray(batchLines.orderId, [...orderIds]));
  const locked = await tx
    .select()
    .from(orders)
    .where(inArray(orders.id, [...orderIds]))
    .for("update");
  for (const order of locked) {
    if (!(BATCH_ORDER_STATUSES as readonly string[]).includes(order.status)) continue;
    const target = orderProgressFromBatches(rows.filter((r) => r.orderId === order.id));
    if (target) await advance(deps, tx, order, target);
  }
}

// ---------------------------------------------------------------------------------------------
// 1. Paid orders → open batches
// ---------------------------------------------------------------------------------------------

/**
 * Puts every paid order into the open batch of the supplier chosen for each line (B3, D-063: an EU
 * supplier first, then the cheapest). An order with a product without an offer waits (returned
 * for the admin).
 */
export async function assignPaidOrders(
  deps: OperationsDeps,
  now = new Date(),
): Promise<{ assigned: number; waiting: string[] }> {
  const { db } = deps;
  const paid = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.status, "paid"))
    .orderBy(asc(orders.paidAt));
  let assigned = 0;
  const waiting: string[] = [];
  for (const { id } of paid) {
    const ok = await db.transaction(async (tx) => {
      const [order] = await tx.select().from(orders).where(eq(orders.id, id)).for("update");
      if (!order || order.status !== "paid") return true;
      const lines = await tx.select().from(orderLines).where(eq(orderLines.orderId, id));
      const offers = await tx
        .select({
          variantId: supplierOffers.variantId,
          supplierId: supplierOffers.supplierId,
          supplierSku: supplierOffers.supplierSku,
          unitCostCents: supplierOffers.unitCostCents,
          inEu: suppliers.inEu,
          weekdays: suppliers.closeWeekdays,
          hour: suppliers.closeHour,
          minute: suppliers.closeMinute,
        })
        .from(supplierOffers)
        .innerJoin(suppliers, eq(suppliers.id, supplierOffers.supplierId))
        .where(
          and(
            inArray(
              supplierOffers.variantId,
              lines.map((l) => l.variantId).filter((v): v is string => !!v),
            ),
            eq(supplierOffers.active, true),
            eq(suppliers.active, true),
          ),
        );
      const chosen = lines.map((line) => ({
        line,
        offer: pickOffer(offers.filter((o) => o.variantId === line.variantId)),
      }));
      if (chosen.some((c) => !c.offer)) return false;
      for (const { line, offer } of chosen) {
        if (!offer) continue;
        const batchId = await openBatch(tx, offer.supplierId, offer, now);
        await tx
          .insert(batchLines)
          .values({
            batchId,
            orderId: id,
            orderLineId: line.id,
            supplierSku: offer.supplierSku,
            description: `${line.title} — ${line.version}`,
            qty: line.qty,
            unitCostCents: offer.unitCostCents,
          })
          .onConflictDoNothing();
      }
      await advance(deps, tx, order, "batched");
      return true;
    });
    if (ok) assigned += 1;
    else waiting.push(id);
  }
  return { assigned, waiting };
}

async function openBatch(
  tx: Tx,
  supplierId: string,
  schedule: { weekdays: number[]; hour: number; minute: number },
  now: Date,
) {
  const find = () =>
    tx
      .select({ id: batches.id })
      .from(batches)
      .where(and(eq(batches.supplierId, supplierId), eq(batches.status, "open")));
  const [existing] = await find();
  if (existing) return existing.id;
  const closesAt = nextBatchCloseAt(now, schedule);
  await tx.insert(batches).values({ supplierId, closesAt, firstClosesAt: closesAt }).onConflictDoNothing();
  const [created] = await find();
  if (!created) throw new Error(`Could not open a batch for ${supplierId}`);
  return created.id;
}

// ---------------------------------------------------------------------------------------------
// 2. Closing batches → purchase orders
// ---------------------------------------------------------------------------------------------

/**
 * Closes every due batch (or the one given). Below the supplier's minimum a batch waits for the
 * next closing, at most 7 days past its first one (B2, D-063). The purchase order goes out by
 * itself only for suppliers with automatic sending; otherwise the closed batch waits for staff to
 * send the file and mark it ordered (D-063, Q39).
 */
export async function closeDueBatches(
  deps: OperationsDeps,
  now = new Date(),
  onlyBatchId?: string,
): Promise<number> {
  const { db } = deps;
  const due = await db
    .select({ batch: batches, supplier: suppliers })
    .from(batches)
    .innerJoin(suppliers, eq(suppliers.id, batches.supplierId))
    .where(
      onlyBatchId
        ? and(eq(batches.id, onlyBatchId), inArray(batches.status, ["open", "closed"]))
        : or(
            and(eq(batches.status, "open"), lte(batches.closesAt, now)),
            and(eq(batches.status, "closed"), eq(suppliers.autoSend, true)),
          ),
    );
  let closed = 0;
  for (const { batch, supplier } of due) {
    if (batch.status === "open") {
      const lines = await db.select().from(batchLines).where(eq(batchLines.batchId, batch.id));
      const nextCloseAt = nextBatchCloseAt(now, {
        weekdays: supplier.closeWeekdays,
        hour: supplier.closeHour,
        minute: supplier.closeMinute,
      });
      const wait =
        !onlyBatchId &&
        waitForMinimum({
          totalCents: purchaseOrderTotalCents(lines.map((l) => ({ ...l, quantity: l.qty }))),
          minOrderCents: supplier.minOrderCents,
          firstClosesAt: batch.firstClosesAt ?? batch.closesAt,
          nextCloseAt,
        });
      if (wait) {
        await db
          .update(batches)
          .set({ closesAt: nextCloseAt, postponed: batch.postponed + 1, updatedAt: now })
          .where(eq(batches.id, batch.id));
        continue;
      }
      // Close first, so no new line joins while the order is being sent.
      await db
        .update(batches)
        .set({
          status: "closed",
          closedAt: now,
          poReference: purchaseOrderReference(now.getUTCFullYear(), batch.seq),
          updatedAt: now,
        })
        .where(and(eq(batches.id, batch.id), eq(batches.status, "open")));
    }
    if (supplier.autoSend) await dispatch(deps, batch.id, now);
    closed += 1;
  }
  return closed;
}

/** Consolidated purchase order lines of a batch (one line per supplier SKU). */
async function purchaseOrderLines(db: Database | Tx, batchId: string) {
  const lines = await db.select().from(batchLines).where(eq(batchLines.batchId, batchId));
  return {
    orderIds: [...new Set(lines.map((l) => l.orderId))],
    lines: consolidateLines(
      lines.map((l) => ({
        supplierSku: l.supplierSku,
        description: l.description,
        quantity: l.qty,
        unitCostCents: l.unitCostCents,
      })),
    ),
  };
}

async function dispatch(deps: OperationsDeps, batchId: string, now: Date) {
  const { db } = deps;
  const [batch] = await db.select().from(batches).where(eq(batches.id, batchId));
  if (!batch || batch.status !== "closed" || !batch.poReference) return;
  const hub = await readHubAddress(db);
  if (!hub) throw new OperationsError("no_hub", "Enter the hub address before sending purchase orders");
  const [supplier] = await db.select().from(suppliers).where(eq(suppliers.id, batch.supplierId));
  const { lines, orderIds } = await purchaseOrderLines(db, batchId);
  const result = await deps.supplier.dispatchPurchaseOrder({
    purchaseOrderId: batch.poReference,
    batchId,
    supplierId: batch.supplierId,
    ddp: supplier?.ddp ?? false,
    deliverTo: { ...hub, country: "BG" },
    lines,
  });
  await db.transaction(async (tx) => {
    await tx
      .update(batches)
      .set({
        status: "ordered",
        orderedAt: now,
        supplierReference: result.supplierReference ?? null,
        updatedAt: now,
      })
      .where(and(eq(batches.id, batchId), eq(batches.status, "closed")));
    await syncOrders(deps, tx, orderIds);
  });
  deps.kick?.();
}

/** The purchase order file of a closed batch, for staff to send themselves (D-063, Q39). */
export async function purchaseOrderFile(db: Database, batchId: string) {
  const [batch] = await db.select().from(batches).where(eq(batches.id, batchId));
  if (!batch) throw new OperationsError("not_found", "No such batch");
  if (batch.status === "open" || !batch.poReference)
    throw new OperationsError("not_allowed", "Close the batch first");
  const { lines } = await purchaseOrderLines(db, batchId);
  return { reference: batch.poReference, csv: purchaseOrderCsv(batch.poReference, lines) };
}

/** Staff sent the purchase order themselves: the batch and its orders become "ordered". */
export async function markBatchOrdered(
  deps: OperationsDeps,
  batchId: string,
  supplierReference: string | null,
  now = new Date(),
) {
  await deps.db.transaction(async (tx) => {
    const [batch] = await tx.select().from(batches).where(eq(batches.id, batchId)).for("update");
    if (!batch) throw new OperationsError("not_found", "No such batch");
    if (batch.status !== "closed")
      throw new OperationsError("not_allowed", "Only a closed batch can be marked as ordered");
    await tx
      .update(batches)
      .set({ status: "ordered", orderedAt: now, supplierReference, updatedAt: now })
      .where(eq(batches.id, batchId));
    await syncOrders(deps, tx, await batchOrderIds(tx, batchId));
  });
  deps.kick?.();
}

/** Staff: the supplier has sent the batch (optionally with its tracking number). */
export async function markBatchShipped(deps: OperationsDeps, batchId: string, tracking: string | null) {
  await deps.db.transaction(async (tx) => {
    const [batch] = await tx.select().from(batches).where(eq(batches.id, batchId)).for("update");
    if (!batch) throw new OperationsError("not_found", "No such batch");
    if (batch.status !== "ordered")
      throw new OperationsError("not_allowed", "Only an ordered batch can be marked as shipped");
    await tx
      .update(batches)
      .set({ status: "shipped", shippedAt: new Date(), supplierTracking: tracking, updatedAt: new Date() })
      .where(eq(batches.id, batchId));
    await syncOrders(deps, tx, await batchOrderIds(tx, batchId));
  });
  deps.kick?.();
}

async function batchOrderIds(tx: Tx, batchId: string) {
  const rows = await tx
    .selectDistinct({ orderId: batchLines.orderId })
    .from(batchLines)
    .where(eq(batchLines.batchId, batchId));
  return rows.map((r) => r.orderId);
}

// ---------------------------------------------------------------------------------------------
// 3. Hub: receiving
// ---------------------------------------------------------------------------------------------

/**
 * One scanned unit (our SKU or the supplier SKU): counts it on the first line of the batch that
 * still misses units.
 */
export async function scanReceived(
  db: Database,
  batchId: string,
  code: string,
): Promise<"ok" | "unknown" | "complete"> {
  return db.transaction(async (tx) => {
    const [batch] = await tx.select().from(batches).where(eq(batches.id, batchId)).for("update");
    if (!batch) throw new OperationsError("not_found", "No such batch");
    if (batch.status !== "shipped" && batch.status !== "ordered")
      throw new OperationsError("not_allowed", "This batch is not being received");
    const wanted = code.trim().toUpperCase();
    const lines = await tx
      .select({ id: batchLines.id, qty: batchLines.qty, received: batchLines.receivedQty })
      .from(batchLines)
      .innerJoin(orderLines, eq(orderLines.id, batchLines.orderLineId))
      .where(
        and(
          eq(batchLines.batchId, batchId),
          or(sql`upper(${batchLines.supplierSku}) = ${wanted}`, sql`upper(${orderLines.sku}) = ${wanted}`),
        ),
      )
      .orderBy(asc(batchLines.id));
    if (lines.length === 0) return "unknown";
    const open = lines.find((l) => l.received < l.qty);
    if (!open) return "complete";
    await tx
      .update(batchLines)
      .set({ receivedQty: sql`${batchLines.receivedQty} + 1` })
      .where(eq(batchLines.id, open.id));
    return "ok";
  });
}

/** Sets the counted units of one supplier SKU (typed instead of scanned), spread over its lines. */
export async function setReceivedQty(db: Database, batchId: string, supplierSku: string, total: number) {
  await db.transaction(async (tx) => {
    const lines = await tx
      .select()
      .from(batchLines)
      .where(and(eq(batchLines.batchId, batchId), eq(batchLines.supplierSku, supplierSku)))
      .orderBy(asc(batchLines.id))
      .for("update");
    if (lines.length === 0) throw new OperationsError("not_found", "No such product in this batch");
    let left = total;
    for (const line of lines) {
      const take = Math.min(line.qty, left);
      left -= take;
      await tx.update(batchLines).set({ receivedQty: take }).where(eq(batchLines.id, line.id));
    }
  });
}

/** Receiving done: the batch is received; orders with every unit counted move to the hub step. */
export async function finishReceiving(deps: OperationsDeps, batchId: string) {
  await deps.db.transaction(async (tx) => {
    const [batch] = await tx.select().from(batches).where(eq(batches.id, batchId)).for("update");
    if (!batch) throw new OperationsError("not_found", "No such batch");
    if (batch.status !== "shipped" && batch.status !== "ordered")
      throw new OperationsError("not_allowed", "This batch is not being received");
    // A batch received without "shipped" first still passes through that step for the customer.
    await tx
      .update(batches)
      .set({
        status: "received",
        receivedAt: new Date(),
        shippedAt: batch.shippedAt ?? new Date(),
        updatedAt: new Date(),
      })
      .where(eq(batches.id, batchId));
    await createShortages(tx, batchId);
    await syncOrders(deps, tx, await batchOrderIds(tx, batchId));
  });
  deps.kick?.();
}

// ---------------------------------------------------------------------------------------------
// 4. Hub: packing and hand-over
// ---------------------------------------------------------------------------------------------

export function carrierFor(deps: OperationsDeps, country: string): CarrierAdapter | undefined {
  return deps.carriers.find((c) => c.countries.includes(country));
}

/** Orders ready to pack, and packed orders waiting for the courier. */
export async function packQueue(db: Database): Promise<PackOrder[]> {
  const rows = await db
    .select()
    .from(orders)
    .where(inArray(orders.status, ["received_at_hub", "packed"]))
    .orderBy(asc(orders.paidAt));
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [lines, offerSkus, parcelRows] = await Promise.all([
    db.select().from(orderLines).where(inArray(orderLines.orderId, ids)).orderBy(asc(orderLines.position)),
    db
      .select({ orderLineId: batchLines.orderLineId, supplierSku: batchLines.supplierSku })
      .from(batchLines)
      .where(inArray(batchLines.orderId, ids)),
    db
      .select()
      .from(parcels)
      .where(and(inArray(parcels.orderId, ids), eq(parcels.status, "labelled"))),
  ]);
  return rows.map((order) => {
    const parcel = parcelRows.find((p) => p.orderId === order.id);
    return {
      id: order.id,
      number: orderNumber(order.seq),
      status: order.status as "received_at_hub" | "packed",
      name: order.address.name,
      city: order.address.city,
      country: order.country,
      lines: lines
        .filter((l) => l.orderId === order.id && l.qty > l.refundedQty)
        .map((l) => ({
          sku: l.sku,
          supplierSku: offerSkus.find((o) => o.orderLineId === l.id)?.supplierSku ?? null,
          title: l.title,
          version: l.version,
          qty: l.qty - l.refundedQty,
        })),
      parcel: parcel
        ? {
            id: parcel.id,
            carrier: parcel.carrier,
            trackingNumber: parcel.trackingNumber,
            weightGrams: parcel.weightGrams,
          }
        : null,
    };
  });
}

/**
 * The packer scanned every item: the server checks the counts against the order (a wrong or
 * missing product is refused), creates the courier label and moves the order to "packed".
 */
export async function packOrder(deps: OperationsDeps, orderId: string, input: PackInput) {
  const { db } = deps;
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw new OperationsError("not_found", "No such order");
  if (order.status !== "received_at_hub")
    throw new OperationsError("not_allowed", "This order is not waiting to be packed");
  const lines = await db.select().from(orderLines).where(eq(orderLines.orderId, orderId));
  const want = new Map<string, number>();
  for (const l of lines) {
    const qty = l.qty - l.refundedQty;
    if (qty > 0) want.set(l.sku.toUpperCase(), (want.get(l.sku.toUpperCase()) ?? 0) + qty);
  }
  const got = new Map<string, number>();
  for (const i of input.items) got.set(i.sku.toUpperCase(), (got.get(i.sku.toUpperCase()) ?? 0) + i.qty);
  const same = want.size === got.size && [...want].every(([sku, qty]) => got.get(sku) === qty);
  if (!same) throw new OperationsError("mismatch", "The scanned items do not match the order");

  const carrier = carrierFor(deps, order.country);
  if (!carrier) throw new OperationsError("no_carrier", `No courier for ${order.country}`);
  const parcelId = crypto.randomUUID();
  const a = order.address;
  const label = await carrier.createShipment({
    orderId: orderNumber(order.seq),
    parcelId,
    recipient: {
      name: a.name,
      phone: a.phone,
      line1: a.line1,
      ...(a.line2 ? { line2: a.line2 } : {}),
      city: a.city,
      postcode: a.postcode,
      country: a.country,
    },
    weightGrams: input.weightGrams,
    valueCents: order.goodsCents,
  });
  try {
    await db.transaction(async (tx) => {
      const [locked] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
      if (!locked || locked.status !== "received_at_hub")
        throw new OperationsError("not_allowed", "Changed meanwhile");
      await tx.insert(parcels).values({
        id: parcelId,
        orderId,
        carrier: carrier.name,
        trackingNumber: label.trackingNumber,
        labelPdf: label.labelPdf,
        weightGrams: input.weightGrams,
      });
      await advance(deps, tx, locked, "packed", { trackingNumber: label.trackingNumber });
    });
  } catch (error) {
    await carrier.cancelShipment(label.trackingNumber).catch(() => undefined);
    throw error;
  }
  return { parcelId, trackingNumber: label.trackingNumber };
}

/** Packed by mistake (e.g. wrong weight): cancels the label so the order can be packed again. */
export async function cancelParcel(deps: OperationsDeps, parcelId: string) {
  const { db } = deps;
  const [parcel] = await db.select().from(parcels).where(eq(parcels.id, parcelId));
  if (!parcel) throw new OperationsError("not_found", "No such parcel");
  if (parcel.status !== "labelled")
    throw new OperationsError("not_allowed", "Only a parcel not yet with the courier can be cancelled");
  await deps.carriers.find((c) => c.name === parcel.carrier)?.cancelShipment(parcel.trackingNumber);
  await db.transaction(async (tx) => {
    await tx
      .update(parcels)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(parcels.id, parcelId));
    const [order] = await tx.select().from(orders).where(eq(orders.id, parcel.orderId)).for("update");
    if (order?.status === "packed")
      await transition(tx, order, "received_at_hub", "system", "parcel_cancelled", {
        trackingNumber: parcel.trackingNumber,
      });
  });
}

/** The courier takes the parcel: the label is scanned at hand-over. */
export async function handOver(deps: OperationsDeps, trackingNumber: string) {
  const result = await deps.db.transaction(async (tx) => {
    const [parcel] = await tx
      .select()
      .from(parcels)
      .where(eq(sql`upper(${parcels.trackingNumber})`, trackingNumber.trim().toUpperCase()))
      .for("update");
    if (!parcel) throw new OperationsError("not_found", "No parcel with this label");
    if (parcel.status !== "labelled")
      throw new OperationsError("not_allowed", "This parcel was already handed over");
    await tx
      .update(parcels)
      .set({ status: "handed_over", handedOverAt: new Date(), updatedAt: new Date() })
      .where(eq(parcels.id, parcel.id));
    const [order] = await tx.select().from(orders).where(eq(orders.id, parcel.orderId)).for("update");
    if (!order) throw new OperationsError("not_found", "No such order");
    await advance(deps, tx, order, "handed_to_carrier", { trackingNumber: parcel.trackingNumber });
    return { orderNumber: orderNumber(order.seq), trackingNumber: parcel.trackingNumber };
  });
  deps.kick?.();
  return result;
}

export async function parcelLabel(db: Database, parcelId: string) {
  const [row] = await db
    .select({ pdf: parcels.labelPdf, trackingNumber: parcels.trackingNumber })
    .from(parcels)
    .where(eq(parcels.id, parcelId));
  return row ?? null;
}

/** Days the customer has to withdraw (ЗЗП, distance contracts). */
const WITHDRAWAL_DAYS = 14;

/**
 * The A4 packing list for one order being packed (D-065): the lines, safety information and
 * warnings in the customer's language, the return address (the hub, D-063) and how to withdraw.
 * Only for orders at the hub, so the hub role sees nothing beyond the parcels it packs.
 */
export async function packingSlip(deps: OperationsDeps, orderId: string): Promise<PackingSlip> {
  const { db } = deps;
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw new OperationsError("not_found", "No such order");
  if (order.status !== "received_at_hub" && order.status !== "packed")
    throw new OperationsError("not_allowed", "Only orders at the hub have a packing list");
  const lines = await db
    .select()
    .from(orderLines)
    .where(eq(orderLines.orderId, orderId))
    .orderBy(asc(orderLines.position));
  const productIds = [...new Set(lines.map((l) => l.productId).filter((id): id is string => !!id))];
  const compliance = productIds.length
    ? await db.select().from(productCompliance).where(inArray(productCompliance.productId, productIds))
    : [];
  const locale = order.locale;
  const pick = (text: { bg: string; en: string } | null | undefined) => text?.[locale]?.trim() || null;
  const safety = productIds.flatMap((productId) => {
    const c = compliance.find((row) => row.productId === productId);
    const info = pick(c?.safetyInfo);
    const warnings = (c?.warnings ?? []).map(pick).filter((w): w is string => !!w);
    if (!info && warnings.length === 0) return [];
    return [{ title: lines.find((l) => l.productId === productId)?.title ?? "", info, warnings }];
  });
  const site = `${deps.webUrl.replace(/\/$/, "")}/${locale}`;
  return {
    orderNumber: orderNumber(order.seq),
    orderedAt: (order.paidAt ?? order.createdAt).toISOString(),
    locale,
    recipient: { name: order.address.name, city: order.address.city, country: order.country },
    lines: lines
      .filter((l) => l.qty > l.refundedQty)
      .map((l) => ({ sku: l.sku, title: l.title, version: l.version, qty: l.qty - l.refundedQty })),
    safety,
    returnAddress: await readHubAddress(db),
    orderUrl: `${site}/orders/${order.id}`,
    withdrawalUrl: `${site}/legal/withdrawal`,
    withdrawalDays: WITHDRAWAL_DAYS,
  };
}

// ---------------------------------------------------------------------------------------------
// 5. Tracking
// ---------------------------------------------------------------------------------------------

const PARCEL_FROM_TRACKING: Partial<Record<TrackingStatus, "out_for_delivery" | "delivered" | "exception">> =
  {
    out_for_delivery: "out_for_delivery",
    delivered: "delivered",
    exception: "exception",
    returned: "exception",
  };

/** Asks the courier about parcels on their way and moves the orders on. */
export async function trackParcels(deps: OperationsDeps, now = new Date()): Promise<number> {
  const { db } = deps;
  const due = await db
    .select()
    .from(parcels)
    .where(
      and(
        inArray(parcels.status, ["handed_over", "out_for_delivery"]),
        or(
          isNull(parcels.lastTrackedAt),
          lte(parcels.lastTrackedAt, new Date(now.getTime() - TRACK_EVERY_MS)),
        ),
      ),
    )
    .orderBy(asc(parcels.lastTrackedAt))
    .limit(100);
  let changed = 0;
  for (const parcel of due) {
    const carrier = deps.carriers.find((c) => c.name === parcel.carrier);
    if (!carrier) continue;
    const events = await carrier.track(parcel.trackingNumber);
    const latest = events.at(-1);
    const next = latest ? PARCEL_FROM_TRACKING[latest.status] : undefined;
    await db.transaction(async (tx) => {
      await tx.update(parcels).set({ lastTrackedAt: now }).where(eq(parcels.id, parcel.id));
      if (!next || next === parcel.status) return;
      await tx
        .update(parcels)
        .set({
          status: next,
          updatedAt: now,
          ...(next === "delivered" ? { deliveredAt: latest?.at ?? now } : {}),
        })
        .where(eq(parcels.id, parcel.id));
      const [order] = await tx.select().from(orders).where(eq(orders.id, parcel.orderId)).for("update");
      if (!order) return;
      if (next === "exception") {
        if (order.status !== "exception") {
          await transition(tx, order, "exception", "system", "carrier_exception", {
            trackingNumber: parcel.trackingNumber,
          });
          await queueStatusEmail(deps, tx, order, "exception");
        }
      } else {
        await advance(deps, tx, order, next);
      }
      changed += 1;
    });
  }
  if (changed > 0) deps.kick?.();
  return changed;
}

/** Everything the tick does for operations, in order. */
export async function runOperations(deps: OperationsDeps, now = new Date()) {
  const { assigned, waiting } = await assignPaidOrders(deps, now);
  const closed = await closeDueBatches(deps, now);
  const tracked = await trackParcels(deps, now);
  const waitingOrders = waiting.length
    ? await deps.db.select({ seq: orders.seq }).from(orders).where(inArray(orders.id, waiting))
    : [];
  return { assigned, closed, tracked, waitingWithoutOffer: waitingOrders.map((o) => orderNumber(o.seq)) };
}

// ---------------------------------------------------------------------------------------------
// Views for the admin
// ---------------------------------------------------------------------------------------------

export async function listBatches(db: Database, limit = 50): Promise<BatchSummary[]> {
  const rows = await db
    .select({
      batch: batches,
      supplierName: suppliers.name,
      orders: sql<number>`count(distinct ${batchLines.orderId})::int`,
      units: sql<number>`coalesce(sum(${batchLines.qty}), 0)::int`,
      receivedUnits: sql<number>`coalesce(sum(${batchLines.receivedQty}), 0)::int`,
      costCents: sql<number>`coalesce(sum(${batchLines.qty} * ${batchLines.unitCostCents}), 0)::int`,
    })
    .from(batches)
    .innerJoin(suppliers, eq(suppliers.id, batches.supplierId))
    .leftJoin(batchLines, eq(batchLines.batchId, batches.id))
    .groupBy(batches.id, suppliers.name)
    .orderBy(desc(batches.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.batch.id,
    supplierId: r.batch.supplierId,
    supplierName: r.supplierName,
    status: r.batch.status,
    poReference: r.batch.poReference,
    closesAt: r.batch.closesAt.toISOString(),
    orders: r.orders,
    units: r.units,
    receivedUnits: r.receivedUnits,
    costCents: r.costCents,
    supplierTracking: r.batch.supplierTracking,
    orderedAt: r.batch.orderedAt?.toISOString() ?? null,
    shippedAt: r.batch.shippedAt?.toISOString() ?? null,
    receivedAt: r.batch.receivedAt?.toISOString() ?? null,
  }));
}

export async function batchDetail(db: Database, batchId: string): Promise<BatchDetail | null> {
  const [summary] = (await listBatches(db, 1000)).filter((b) => b.id === batchId);
  if (!summary) return null;
  const lines = await db
    .select({ line: batchLines, sku: orderLines.sku, seq: orders.seq })
    .from(batchLines)
    .innerJoin(orderLines, eq(orderLines.id, batchLines.orderLineId))
    .innerJoin(orders, eq(orders.id, batchLines.orderId))
    .where(eq(batchLines.batchId, batchId))
    .orderBy(asc(batchLines.supplierSku));
  const damage = await db
    .select({
      supplierSku: batchDamage.supplierSku,
      qty: batchDamage.qty,
      photo: sql<boolean>`${batchDamage.photo} is not null`,
    })
    .from(batchDamage)
    .where(eq(batchDamage.batchId, batchId));
  const items = new Map<string, BatchDetail["items"][number]>();
  for (const { line, sku } of lines) {
    const item = items.get(line.supplierSku);
    if (item) {
      item.qty += line.qty;
      item.receivedQty += line.receivedQty;
    } else
      items.set(line.supplierSku, {
        supplierSku: line.supplierSku,
        sku,
        description: line.description,
        qty: line.qty,
        receivedQty: line.receivedQty,
        unitCostCents: line.unitCostCents,
        damagedQty: damage.find((d) => d.supplierSku === line.supplierSku)?.qty ?? 0,
        damagePhoto: damage.find((d) => d.supplierSku === line.supplierSku)?.photo ?? false,
      });
  }
  return {
    ...summary,
    items: [...items.values()],
    orderNumbers: [...new Set(lines.map((l) => orderNumber(l.seq)))],
  };
}

/** Variant id by our SKU (offers are entered with our SKU). */
export async function variantBySku(db: Database, sku: string) {
  const [row] = await db
    .select({ id: variants.id })
    .from(variants)
    .where(eq(sql`upper(${variants.sku})`, sku.trim().toUpperCase()));
  return row ?? null;
}
