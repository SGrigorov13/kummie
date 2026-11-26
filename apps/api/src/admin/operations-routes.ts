import {
  BatchDetail,
  BatchList,
  BatchShipped,
  HandOverInput,
  HandOverResult,
  IdParams,
  OperationsRun,
  OperationsSettings,
  HubAddress,
  PackInput,
  PackQueue,
  ReceivedQtyInput,
  ScanInput,
  ScanResult,
  Supplier,
  SupplierList,
  SupplierOfferInput,
  SupplierOfferList,
} from "@kummie/contracts";
import { and, asc, eq, notExists, sql } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { products, supplierOffers, suppliers, variants } from "../db/schema";
import {
  batchDetail,
  cancelParcel,
  closeDueBatches,
  finishReceiving,
  handOver,
  listBatches,
  markBatchShipped,
  OperationsError,
  packOrder,
  packQueue,
  parcelLabel,
  readHubAddress,
  runOperations,
  scanReceived,
  setReceivedQty,
  variantBySku,
  writeHubAddress,
  type OperationsDeps,
} from "../operations/service";
import { audit, requireStaff, type AdminDeps } from "./context";

const ApiError = z.object({ error: z.string(), message: z.string() });
const SupplierParams = z.object({ id: z.string().min(1).max(40) });
const HTTP: Record<OperationsError["code"], 404 | 409 | 422> = {
  not_found: 404,
  not_allowed: 409,
  mismatch: 422,
  no_carrier: 409,
  no_hub: 409,
};

/**
 * M2 operations in the admin (docs/specs/M2-operations.md): suppliers, offers and the hub address
 * (admin); batches (admin); receiving, packing and hand-over (admin and hub).
 */
export function operationsRoutes(deps: AdminDeps & { operations: OperationsDeps }): FastifyPluginAsyncZod {
  const { db, operations } = deps;
  const onlyAdmin = requireStaff(db, ["admin"]);
  const hubStaff = requireStaff(db, ["admin", "hub"]);
  const staffId = (request: { staff: { id: string } | null }) => request.staff?.id ?? null;

  return async (app) => {
    app.setErrorHandler((error, _request, reply) => {
      if (error instanceof OperationsError)
        return reply.code(HTTP[error.code]).send({ error: error.code, message: error.message });
      throw error;
    });

    // ---------- Suppliers, offers, hub address (admin) ----------

    app.get(
      "/admin-api/suppliers",
      { preHandler: onlyAdmin, schema: { response: { 200: SupplierList } } },
      async () => ({ items: await db.select().from(suppliers).orderBy(asc(suppliers.name)) }),
    );

    app.put(
      "/admin-api/suppliers/:id",
      {
        preHandler: onlyAdmin,
        schema: { params: SupplierParams, body: Supplier, response: { 200: Supplier, 422: ApiError } },
      },
      async (request, reply) => {
        if (request.body.id !== request.params.id)
          return reply.code(422).send({ error: "id_mismatch", message: "The id cannot change" });
        const values = {
          ...request.body,
          closeWeekdays: [...new Set(request.body.closeWeekdays)].toSorted(),
        };
        await db
          .insert(suppliers)
          .values(values)
          .onConflictDoUpdate({ target: suppliers.id, set: { ...values, updatedAt: new Date() } });
        await audit(db, staffId(request), "supplier.saved", "supplier", request.params.id);
        const [saved] = await db.select().from(suppliers).where(eq(suppliers.id, request.params.id));
        return saved as Supplier;
      },
    );

    const offersOf = async (supplierId: string) => {
      const items = await db
        .select({
          id: supplierOffers.id,
          supplierId: supplierOffers.supplierId,
          sku: variants.sku,
          title: products.title,
          version: variants.version,
          supplierSku: supplierOffers.supplierSku,
          unitCostCents: supplierOffers.unitCostCents,
          priceCents: variants.priceCents,
          active: supplierOffers.active,
        })
        .from(supplierOffers)
        .innerJoin(variants, eq(variants.id, supplierOffers.variantId))
        .innerJoin(products, eq(products.id, variants.productId))
        .where(eq(supplierOffers.supplierId, supplierId))
        .orderBy(asc(products.title), asc(variants.position));
      const withoutOffer = await db
        .select({ sku: variants.sku, title: products.title, version: variants.version })
        .from(variants)
        .innerJoin(products, eq(products.id, variants.productId))
        .where(
          and(
            eq(variants.active, true),
            eq(products.status, "published"),
            notExists(
              db
                .select({ one: sql`1` })
                .from(supplierOffers)
                .where(and(eq(supplierOffers.variantId, variants.id), eq(supplierOffers.active, true))),
            ),
          ),
        )
        .orderBy(asc(products.title))
        .limit(200);
      return { items, withoutOffer };
    };

    app.get(
      "/admin-api/suppliers/:id/offers",
      { preHandler: onlyAdmin, schema: { params: SupplierParams, response: { 200: SupplierOfferList } } },
      async (request) => offersOf(request.params.id),
    );

    app.put(
      "/admin-api/suppliers/:id/offers",
      {
        preHandler: onlyAdmin,
        schema: {
          params: SupplierParams,
          body: SupplierOfferInput,
          response: { 200: SupplierOfferList, 404: ApiError },
        },
      },
      async (request, reply) => {
        const [supplier] = await db.select().from(suppliers).where(eq(suppliers.id, request.params.id));
        if (!supplier) return reply.code(404).send({ error: "not_found", message: "No such supplier" });
        const variant = await variantBySku(db, request.body.sku);
        if (!variant)
          return reply.code(404).send({ error: "unknown_sku", message: "No product with this SKU" });
        const values = {
          variantId: variant.id,
          supplierId: supplier.id,
          supplierSku: request.body.supplierSku.toUpperCase(),
          unitCostCents: request.body.unitCostCents,
          active: request.body.active,
        };
        await db
          .insert(supplierOffers)
          .values(values)
          .onConflictDoUpdate({
            target: [supplierOffers.variantId, supplierOffers.supplierId],
            set: { ...values, updatedAt: new Date() },
          });
        await audit(db, staffId(request), "supplier.offer_saved", "supplier", supplier.id, {
          sku: request.body.sku,
        });
        return offersOf(supplier.id);
      },
    );

    app.get(
      "/admin-api/operations/settings",
      { preHandler: onlyAdmin, schema: { response: { 200: OperationsSettings } } },
      async () => ({ hub: await readHubAddress(db) }),
    );

    app.put(
      "/admin-api/operations/settings",
      { preHandler: onlyAdmin, schema: { body: HubAddress, response: { 200: OperationsSettings } } },
      async (request) => {
        await writeHubAddress(db, request.body, staffId(request));
        await audit(db, staffId(request), "operations.hub_address", "settings", "operations");
        return { hub: await readHubAddress(db) };
      },
    );

    /** Runs what the tick does (assign, close due batches, track) — handy for testing. */
    app.post(
      "/admin-api/operations/run",
      { preHandler: onlyAdmin, schema: { response: { 200: OperationsRun } } },
      async () => runOperations(operations),
    );

    // ---------- Batches ----------

    app.get(
      "/admin-api/batches",
      { preHandler: hubStaff, schema: { response: { 200: BatchList } } },
      async () => ({ items: await listBatches(db) }),
    );

    const detail = async (id: string) => {
      const found = await batchDetail(db, id);
      if (!found) throw new OperationsError("not_found", "No such batch");
      return found;
    };

    app.get(
      "/admin-api/batches/:id",
      { preHandler: hubStaff, schema: { params: IdParams, response: { 200: BatchDetail, 404: ApiError } } },
      async (request) => detail(request.params.id),
    );

    app.post(
      "/admin-api/batches/:id/close",
      {
        preHandler: onlyAdmin,
        schema: { params: IdParams, response: { 200: BatchDetail, 404: ApiError, 409: ApiError } },
      },
      async (request) => {
        await detail(request.params.id);
        await closeDueBatches(operations, new Date(), request.params.id);
        await audit(db, staffId(request), "batch.closed", "batch", request.params.id);
        return detail(request.params.id);
      },
    );

    app.post(
      "/admin-api/batches/:id/shipped",
      {
        preHandler: onlyAdmin,
        schema: {
          params: IdParams,
          body: BatchShipped,
          response: { 200: BatchDetail, 404: ApiError, 409: ApiError },
        },
      },
      async (request) => {
        await markBatchShipped(operations, request.params.id, request.body.tracking);
        await audit(db, staffId(request), "batch.shipped", "batch", request.params.id);
        return detail(request.params.id);
      },
    );

    // ---------- Hub: receiving ----------

    app.post(
      "/admin-api/hub/batches/:id/scan",
      {
        preHandler: hubStaff,
        schema: {
          params: IdParams,
          body: ScanInput,
          response: { 200: ScanResult, 404: ApiError, 409: ApiError },
        },
      },
      async (request) => {
        const outcome = await scanReceived(db, request.params.id, request.body.code);
        return {
          ok: outcome === "ok",
          problem: outcome === "ok" ? null : outcome,
          batch: await detail(request.params.id),
        };
      },
    );

    app.put(
      "/admin-api/hub/batches/:id/received",
      {
        preHandler: hubStaff,
        schema: {
          params: IdParams,
          body: ReceivedQtyInput,
          response: { 200: BatchDetail, 404: ApiError, 409: ApiError },
        },
      },
      async (request) => {
        await setReceivedQty(db, request.params.id, request.body.supplierSku, request.body.receivedQty);
        return detail(request.params.id);
      },
    );

    app.post(
      "/admin-api/hub/batches/:id/done",
      {
        preHandler: hubStaff,
        schema: { params: IdParams, response: { 200: BatchDetail, 404: ApiError, 409: ApiError } },
      },
      async (request) => {
        await finishReceiving(operations, request.params.id);
        await audit(db, staffId(request), "batch.received", "batch", request.params.id);
        return detail(request.params.id);
      },
    );

    // ---------- Hub: packing and hand-over ----------

    app.get(
      "/admin-api/hub/packing",
      { preHandler: hubStaff, schema: { response: { 200: PackQueue } } },
      async () => ({ items: await packQueue(db) }),
    );

    app.post(
      "/admin-api/hub/orders/:id/pack",
      {
        preHandler: hubStaff,
        schema: {
          params: IdParams,
          body: PackInput,
          response: { 200: PackQueue, 404: ApiError, 409: ApiError, 422: ApiError },
        },
      },
      async (request) => {
        const parcel = await packOrder(operations, request.params.id, request.body);
        await audit(db, staffId(request), "order.packed", "order", request.params.id, {
          trackingNumber: parcel.trackingNumber,
        });
        return { items: await packQueue(db) };
      },
    );

    app.post(
      "/admin-api/hub/parcels/:id/cancel",
      {
        preHandler: hubStaff,
        schema: { params: IdParams, response: { 200: PackQueue, 404: ApiError, 409: ApiError } },
      },
      async (request) => {
        await cancelParcel(operations, request.params.id);
        await audit(db, staffId(request), "parcel.cancelled", "parcel", request.params.id);
        return { items: await packQueue(db) };
      },
    );

    /** The label PDF (opened in a new tab to print; the staff cookie goes along). */
    app.get(
      "/admin-api/hub/parcels/:id/label",
      { preHandler: hubStaff, schema: { params: IdParams } },
      async (request, reply) => {
        const label = await parcelLabel(db, request.params.id);
        if (!label) return reply.code(404).send({ error: "not_found", message: "No such parcel" });
        return reply
          .header("content-type", "application/pdf")
          .header("content-disposition", `inline; filename="label-${label.trackingNumber}.pdf"`)
          .header("cache-control", "no-store")
          .send(Buffer.from(label.pdf));
      },
    );

    app.post(
      "/admin-api/hub/handover",
      {
        preHandler: hubStaff,
        schema: { body: HandOverInput, response: { 200: HandOverResult, 404: ApiError, 409: ApiError } },
      },
      async (request) => {
        const result = await handOver(operations, request.body.trackingNumber);
        await audit(db, staffId(request), "parcel.handed_over", "parcel", result.trackingNumber);
        return result;
      },
    );
  };
}
