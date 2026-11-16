import {
  AdminOrder,
  AdminOrderList,
  AdminOrderListQuery,
  IdParams,
  OrderStatusChange,
} from "@kummie/contracts";
import { staffNextStatuses } from "@kummie/core";
import { and, asc, desc, eq, ilike, sql, type SQL } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { Database } from "../db/client";
import { orderEvents, orders, payments, refunds } from "../db/schema";
import { changeOrderStatus, StatusChangeError } from "../shop/lifecycle";
import { orderDetail, orderNumber, type OrderRow, type ShopDeps } from "../shop/orders";
import { audit, requireStaff, type AdminDeps } from "./context";

const ApiError = z.object({ error: z.string(), message: z.string() });
const PAGE_SIZE = 50;

async function adminOrder(db: Database, order: OrderRow): Promise<AdminOrder> {
  const [detail, history, paymentRows, refundRows] = await Promise.all([
    orderDetail(db, order),
    db.select().from(orderEvents).where(eq(orderEvents.orderId, order.id)).orderBy(asc(orderEvents.at)),
    db.select().from(payments).where(eq(payments.orderId, order.id)).orderBy(asc(payments.createdAt)),
    db.select().from(refunds).where(eq(refunds.orderId, order.id)).orderBy(asc(refunds.createdAt)),
  ]);
  return {
    ...detail,
    email: order.email,
    guest: !order.customerId,
    history: history.map((e) => ({
      type: e.type,
      fromStatus: e.fromStatus,
      toStatus: e.toStatus,
      actor: e.actor,
      note: typeof e.data.note === "string" ? e.data.note : null,
      at: e.at.toISOString(),
    })),
    payments: paymentRows.map((p) => ({
      provider: p.provider,
      status: p.status,
      amountCents: p.amountCents,
      createdAt: p.createdAt.toISOString(),
    })),
    refunds: refundRows.map((r) => ({
      amountCents: r.amountCents,
      reason: r.reason,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    })),
    next: staffNextStatuses(order.status),
  };
}

/** Admin → Orders: list, detail with the full history, manual status change (admin only, audited). */
export function ordersAdminRoutes(deps: AdminDeps & { shop: ShopDeps }): FastifyPluginAsyncZod {
  const { db, shop } = deps;
  const canView = requireStaff(db, ["admin", "hub"]);
  const onlyAdmin = requireStaff(db, ["admin"]);

  return async (app) => {
    app.get(
      "/admin-api/orders",
      {
        preHandler: canView,
        schema: { querystring: AdminOrderListQuery, response: { 200: AdminOrderList } },
      },
      async (request) => {
        const { status, q, page } = request.query;
        const where: SQL[] = [];
        if (status) where.push(eq(orders.status, status));
        if (q) {
          const digits = /^(?:KUM-)?(\d{1,12})$/i.exec(q)?.[1];
          where.push(digits ? eq(orders.seq, Number(digits)) : ilike(orders.email, `%${q}%`));
        }
        const condition = where.length > 0 ? and(...where) : undefined;
        const [rows, [{ total } = { total: 0 }]] = await Promise.all([
          db
            .select()
            .from(orders)
            .where(condition)
            .orderBy(desc(orders.createdAt))
            .limit(PAGE_SIZE)
            .offset((page - 1) * PAGE_SIZE),
          db
            .select({ total: sql<number>`count(*)::int` })
            .from(orders)
            .where(condition),
        ]);
        return {
          total,
          items: rows.map((o) => ({
            id: o.id,
            number: orderNumber(o.seq),
            status: o.status,
            createdAt: o.createdAt.toISOString(),
            email: o.email,
            name: o.address.name,
            country: o.country,
            totalCents: o.totalCents,
            guest: !o.customerId,
          })),
        };
      },
    );

    app.get(
      "/admin-api/orders/:id",
      { preHandler: canView, schema: { params: IdParams, response: { 200: AdminOrder, 404: ApiError } } },
      async (request, reply) => {
        const [order] = await db.select().from(orders).where(eq(orders.id, request.params.id));
        if (!order) return reply.code(404).send({ error: "not_found", message: "No such order" });
        return adminOrder(db, order);
      },
    );

    app.post(
      "/admin-api/orders/:id/status",
      {
        preHandler: onlyAdmin,
        schema: {
          params: IdParams,
          body: OrderStatusChange,
          response: { 200: AdminOrder, 404: ApiError, 409: ApiError, 502: ApiError },
        },
      },
      async (request, reply) => {
        const staffId = request.staff?.id ?? null;
        const [before] = await db.select().from(orders).where(eq(orders.id, request.params.id));
        if (!before) return reply.code(404).send({ error: "not_found", message: "No such order" });
        try {
          const updated = await changeOrderStatus(
            shop,
            before.id,
            request.body.to,
            `staff:${staffId ?? "unknown"}`,
            request.body.note ?? null,
          );
          await audit(db, staffId, "order.status", "order", before.id, {
            from: before.status,
            to: request.body.to,
            ...(request.body.note ? { note: request.body.note } : {}),
          });
          return adminOrder(db, updated);
        } catch (error) {
          if (error instanceof StatusChangeError) {
            const code = error.code === "refund_failed" ? 502 : 409;
            return reply.code(code).send({ error: error.code, message: error.message });
          }
          throw error;
        }
      },
    );
  };
}
