import {
  Cart,
  CartCountryUpdate,
  CartLineUpdate,
  CheckoutRequest,
  CheckoutResponse,
  IdParams,
  InvoiceRequest,
  MAX_LINE_QTY,
  OrderDetail,
  OrderList,
  PayResponse,
} from "@kummie/contracts";
import { and, desc, eq, sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { customerFromRequest, TERMS_VERSION } from "../accounts/context";
import { randomToken, safeEqual } from "../auth/crypto";
import {
  addresses,
  cartLines,
  carts,
  orderEvents,
  orderLines,
  orders,
  products,
  variants,
  salesDocuments,
} from "../db/schema";
import { customerCanCancel } from "@kummie/core";
import { cartView, priceCart, pricedLines, resolveCart } from "./cart-store";
import { supplierAvailable } from "../catalogue/availability";
import { documentFileName, renderDocumentPdf } from "../documents/pdf";
import { loadSalesReadiness, runtimeOf } from "../admin/golive";
import { changeOrderStatus, StatusChangeError } from "./lifecycle";
import { InvoiceNotPossible, NumberRangeExhausted } from "../documents/issue";
import {
  orderDetail,
  orderNumber,
  requestLateInvoice,
  startPayment,
  vatShares,
  type OrderRow,
  type ShopDeps,
} from "./orders";

const ApiError = z.object({ error: z.string(), message: z.string() });
const CartChanged = ApiError.extend({
  problems: z.array(z.object({ variantId: z.string(), reason: z.string() })),
});
const MAX_LINES = 50;
/** Real sales are switched off (go-live gate, Task 13) — nothing can be paid right now. */
const SALES_CLOSED = { error: "sales_closed", message: "The shop is not taking orders yet" } as const;
const MAX_ADDRESSES = 10;

export function shopRoutes(deps: ShopDeps): FastifyPluginAsyncZod {
  const { db, cookieSecure } = deps;

  /** The order if this browser may see it: its customer, or a guest holding the key. */
  async function accessibleOrder(request: FastifyRequest, id: string): Promise<OrderRow | null> {
    const [order] = await db.select().from(orders).where(eq(orders.id, id));
    if (!order) return null;
    if (order.customerId) {
      const customer = await customerFromRequest(db, request);
      return customer?.id === order.customerId ? order : null;
    }
    const key = request.headers["x-order-key"];
    if (typeof key === "string" && order.accessKey && safeEqual(key, order.accessKey)) {
      return order;
    }
    return null;
  }

  const notFound = { error: "not_found", message: "No such order" } as const;

  return async (app) => {
    // ---- Cart ----

    app.get("/cart", { schema: { response: { 200: Cart } } }, async (request, reply) => {
      const { cart, customerId } = await resolveCart(db, request, reply, { create: false, cookieSecure });
      return cartView(db, cart, !!customerId);
    });

    app.put(
      "/cart/lines",
      {
        config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
        schema: { body: CartLineUpdate, response: { 200: Cart, 404: ApiError, 409: ApiError } },
      },
      async (request, reply) => {
        const { variantId, qty, add } = request.body;
        const [variant] = await db
          .select({
            id: variants.id,
            active: variants.active,
            status: products.status,
            available: supplierAvailable(),
          })
          .from(variants)
          .innerJoin(products, eq(products.id, variants.productId))
          .where(eq(variants.id, variantId));
        if (
          !variant ||
          (qty > 0 && (!variant.active || !variant.available || variant.status !== "published"))
        ) {
          return reply.code(404).send({ error: "unavailable", message: "This product cannot be bought now" });
        }
        const { cart, customerId } = await resolveCart(db, request, reply, { create: true, cookieSecure });
        if (!cart) throw new Error("cart not created");
        const [existing] = await db
          .select({ qty: cartLines.qty })
          .from(cartLines)
          .where(and(eq(cartLines.cartId, cart.id), eq(cartLines.variantId, variantId)));
        const next = Math.min(add ? (existing?.qty ?? 0) + qty : qty, MAX_LINE_QTY);
        if (next <= 0) {
          await db
            .delete(cartLines)
            .where(and(eq(cartLines.cartId, cart.id), eq(cartLines.variantId, variantId)));
        } else if (existing) {
          await db
            .update(cartLines)
            .set({ qty: next })
            .where(and(eq(cartLines.cartId, cart.id), eq(cartLines.variantId, variantId)));
        } else {
          const [{ count } = { count: 0 }] = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(cartLines)
            .where(eq(cartLines.cartId, cart.id));
          if (count >= MAX_LINES) {
            return reply.code(409).send({ error: "cart_full", message: `At most ${MAX_LINES} products` });
          }
          await db.insert(cartLines).values({ cartId: cart.id, variantId, qty: next });
        }
        await db.update(carts).set({ updatedAt: new Date() }).where(eq(carts.id, cart.id));
        return cartView(db, cart, !!customerId);
      },
    );

    app.put(
      "/cart/country",
      { schema: { body: CartCountryUpdate, response: { 200: Cart } } },
      async (request, reply) => {
        const { cart, customerId } = await resolveCart(db, request, reply, { create: true, cookieSecure });
        if (!cart) throw new Error("cart not created");
        const [updated] = await db
          .update(carts)
          .set({ country: request.body.country, updatedAt: new Date() })
          .where(eq(carts.id, cart.id))
          .returning();
        return cartView(db, updated ?? cart, !!customerId);
      },
    );

    // ---- Checkout ----

    app.post(
      "/checkout",
      {
        config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
        schema: {
          body: CheckoutRequest,
          response: {
            200: CheckoutResponse,
            400: ApiError,
            409: CartChanged.or(ApiError),
            502: ApiError,
            503: ApiError,
          },
        },
      },
      async (request, reply) => {
        const input = request.body;
        if ((await loadSalesReadiness(db, runtimeOf(deps))).mode === "closed") {
          return reply.code(503).send(SALES_CLOSED);
        }
        const customer = await customerFromRequest(db, request);
        const { cart } = await resolveCart(db, request, reply, { create: false, cookieSecure });
        const country = input.address.country;
        const lines = cart ? await pricedLines(db, cart.id, country) : [];
        if (!cart || lines.length === 0) {
          return reply.code(409).send({ error: "empty_cart", message: "The cart is empty" });
        }
        const problems = lines
          .filter((l) => !l.available)
          .map((l) => ({ variantId: l.variantId, reason: "unavailable" }));
        if (problems.length > 0) {
          return reply
            .code(409)
            .send({ error: "cart_changed", message: "Some products cannot be bought now", problems });
        }
        const email = customer?.email ?? input.email;
        if (!email) return reply.code(400).send({ error: "email_required", message: "Enter your e-mail" });

        const { quote, vatCountry } = await priceCart(db, lines, country, !!customer);
        const shares = vatShares(
          lines.map((l) => l.lineTotalCents),
          quote.shippingCents,
          quote.vatCents,
        );
        const key = customer ? null : randomToken();
        const { name, line1, line2, city, postcode, phone } = input.address;

        const order = await db.transaction(async (tx) => {
          if (cart.country !== country) await tx.update(carts).set({ country }).where(eq(carts.id, cart.id));
          const [created] = await tx
            .insert(orders)
            .values({
              customerId: customer?.id ?? null,
              accessKey: key,
              cartId: cart.id,
              email,
              locale: input.locale,
              country,
              address: { name, line1, line2, city, postcode, country, phone },
              invoice: input.invoice,
              goodsCents: quote.goodsCents,
              shippingCents: quote.shippingCents,
              totalCents: quote.totalCents,
              vatCountry,
              vatRateBp: Math.round(quote.vatRate * 10_000),
              vatCents: quote.vatCents,
              shippingVatCents: shares.shipping,
              kummies: quote.kummies,
              termsVersion: TERMS_VERSION,
            })
            .returning();
          if (!created) throw new Error("order not created");
          await tx.insert(orderLines).values(
            lines.map((l, position) => ({
              orderId: created.id,
              variantId: l.variantId,
              productId: l.productId,
              title: l.title,
              version: l.version,
              sku: l.sku,
              sourcing: l.sourcing,
              unitPriceCents: l.priceCents,
              qty: l.qty,
              lineTotalCents: l.lineTotalCents,
              vatCents: shares.lines[position] ?? 0,
              dispatchEstimate: l.dispatchEstimate,
              position,
            })),
          );
          await tx.insert(orderEvents).values({
            orderId: created.id,
            type: "created",
            toStatus: "pending_payment",
            actor: "customer",
            data: { termsVersion: TERMS_VERSION },
          });
          if (customer && input.saveAddress) {
            const [{ count } = { count: 0 }] = await tx
              .select({ count: sql<number>`count(*)::int` })
              .from(addresses)
              .where(eq(addresses.customerId, customer.id));
            if (count < MAX_ADDRESSES) {
              await tx
                .insert(addresses)
                .values({ ...input.address, customerId: customer.id, isDefault: count === 0 });
            }
          }
          return created;
        });

        try {
          const redirectUrl = await startPayment(deps, order, key);
          return { orderId: order.id, number: orderNumber(order.seq), orderKey: key, redirectUrl };
        } catch (error) {
          request.log.error({ err: error, orderId: order.id }, "payment session failed");
          return reply
            .code(502)
            .send({ error: "payment_unavailable", message: "Payment is not available right now" });
        }
      },
    );

    // ---- Orders ----

    app.get(
      "/orders/:id",
      { schema: { params: IdParams, response: { 200: OrderDetail, 404: ApiError } } },
      async (request, reply) => {
        const order = await accessibleOrder(request, request.params.id);
        if (!order) return reply.code(404).send(notFound);
        return orderDetail(db, order);
      },
    );

    app.post(
      "/orders/:id/pay",
      {
        config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
        schema: {
          params: IdParams,
          response: { 200: PayResponse, 404: ApiError, 409: ApiError, 502: ApiError, 503: ApiError },
        },
      },
      async (request, reply) => {
        const order = await accessibleOrder(request, request.params.id);
        if (!order) return reply.code(404).send(notFound);
        if ((await loadSalesReadiness(db, runtimeOf(deps))).mode === "closed") {
          return reply.code(503).send(SALES_CLOSED);
        }
        if (order.status !== "pending_payment") {
          return reply
            .code(409)
            .send({ error: "not_payable", message: "This order is already paid or closed" });
        }
        const key =
          typeof request.headers["x-order-key"] === "string" ? request.headers["x-order-key"] : null;
        try {
          return { redirectUrl: await startPayment(deps, order, order.customerId ? null : key) };
        } catch (error) {
          request.log.error({ err: error, orderId: order.id }, "payment session failed");
          return reply
            .code(502)
            .send({ error: "payment_unavailable", message: "Payment is not available right now" });
        }
      },
    );

    app.post(
      "/orders/:id/cancel",
      {
        config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
        schema: {
          params: IdParams,
          response: { 200: OrderDetail, 404: ApiError, 409: ApiError, 502: ApiError },
        },
      },
      async (request, reply) => {
        const order = await accessibleOrder(request, request.params.id);
        if (!order) return reply.code(404).send(notFound);
        if (!customerCanCancel(order.status)) {
          return reply
            .code(409)
            .send({ error: "not_cancellable", message: "The order is already with the supplier" });
        }
        try {
          const updated = await changeOrderStatus(deps, order.id, "cancelled", "customer");
          return orderDetail(db, updated);
        } catch (error) {
          if (error instanceof StatusChangeError && error.code === "refund_failed") {
            request.log.error({ err: error, orderId: order.id }, "refund failed");
            return reply
              .code(502)
              .send({ error: "refund_failed", message: "The refund could not be made now" });
          }
          if (error instanceof StatusChangeError) {
            return reply.code(409).send({ error: "not_cancellable", message: error.message });
          }
          throw error;
        }
      },
    );

    app.post(
      "/orders/:id/invoice",
      {
        config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
        schema: {
          params: IdParams,
          body: InvoiceRequest,
          response: { 200: OrderDetail, 404: ApiError, 409: ApiError, 503: ApiError },
        },
      },
      async (request, reply) => {
        const order = await accessibleOrder(request, request.params.id);
        if (!order) return reply.code(404).send(notFound);
        if (!(await orderDetail(db, order)).invoiceRequestUntil) {
          return reply.code(409).send({
            error: "invoice_not_possible",
            message: "An invoice can no longer be requested for this order",
          });
        }
        try {
          await requestLateInvoice(deps, order, request.body);
        } catch (error) {
          if (error instanceof InvoiceNotPossible) {
            return reply.code(409).send({ error: "invoice_not_possible", message: error.message });
          }
          if (error instanceof NumberRangeExhausted) {
            request.log.error({ series: error.series }, "document number range used up");
            return reply
              .code(503)
              .send({ error: "numbering_exhausted", message: "Invoices cannot be issued right now" });
          }
          throw error;
        }
        deps.kick?.();
        const [fresh] = await db.select().from(orders).where(eq(orders.id, order.id));
        return orderDetail(db, fresh ?? order);
      },
    );

    app.get<{ Params: { id: string; documentId: string } }>(
      "/orders/:id/documents/:documentId",
      { schema: { params: z.object({ id: z.string().uuid(), documentId: z.string().uuid() }) } },
      async (request, reply) => {
        const order = await accessibleOrder(request, request.params.id);
        if (!order) return reply.code(404).send(notFound);
        const [doc] = await db
          .select()
          .from(salesDocuments)
          .where(and(eq(salesDocuments.id, request.params.documentId), eq(salesDocuments.orderId, order.id)));
        if (!doc) return reply.code(404).send(notFound);
        const pdf = await renderDocumentPdf(doc);
        return reply
          .header("content-type", "application/pdf")
          .header("cache-control", "private, no-store")
          .header("content-disposition", `attachment; filename="${documentFileName(doc)}"`)
          .send(pdf);
      },
    );

    app.get(
      "/account/orders",
      { schema: { response: { 200: OrderList, 401: ApiError } } },
      async (request, reply) => {
        const customer = await customerFromRequest(db, request);
        if (!customer) return reply.code(401).send({ error: "unauthorized", message: "Please sign in" });
        const rows = await db
          .select()
          .from(orders)
          .where(eq(orders.customerId, customer.id))
          .orderBy(desc(orders.createdAt))
          .limit(100);
        return {
          items: rows.map((o) => ({
            id: o.id,
            number: orderNumber(o.seq),
            status: o.status,
            createdAt: o.createdAt.toISOString(),
            totalCents: o.totalCents,
          })),
        };
      },
    );
  };
}
