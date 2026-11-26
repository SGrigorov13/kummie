import type { Cart, CartLine } from "@kummie/contracts";
import { businessDay, FREE_SHIPPING_FROM_CENTS, quoteCart, vatCountryFor, type Country } from "@kummie/core";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import { customerFromRequest } from "../accounts/context";
import { randomToken, sha256 } from "../auth/crypto";
import type { Database } from "../db/client";
import { cartLines, carts, productCompliance, products, variants } from "../db/schema";
import { loadCompanySettings } from "../admin/settings-routes";
import { supplierAvailable } from "../catalogue/availability";

export const CART_COOKIE = "kummie_cart";
const CART_DAYS = 60;

type Writer = Pick<Database, "select" | "insert" | "update" | "delete">;
export type CartRow = typeof carts.$inferSelect;

function setCartCookie(reply: FastifyReply, token: string, secure: boolean) {
  reply.setCookie(CART_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    expires: new Date(Date.now() + CART_DAYS * 86_400_000),
  });
}

/**
 * The open cart of this browser: the customer's cart when signed in, otherwise the guest cart from
 * the cookie. With `create`, a missing cart is made (and a guest cookie set).
 */
export async function resolveCart(
  db: Database,
  request: FastifyRequest,
  reply: FastifyReply,
  { create, cookieSecure }: { create: boolean; cookieSecure: boolean },
): Promise<{ cart: CartRow | null; customerId: string | null }> {
  const customer = await customerFromRequest(db, request);
  if (customer) {
    let [cart] = await db.select().from(carts).where(eq(carts.customerId, customer.id));
    if (!cart && create) {
      [cart] = await db.insert(carts).values({ customerId: customer.id }).onConflictDoNothing().returning();
      cart ??= (await db.select().from(carts).where(eq(carts.customerId, customer.id)))[0];
    }
    return { cart: cart ?? null, customerId: customer.id };
  }
  const token = request.cookies[CART_COOKIE];
  if (token) {
    const [cart] = await db
      .select()
      .from(carts)
      .where(eq(carts.guestTokenHash, sha256(token)));
    if (cart) return { cart, customerId: null };
  }
  if (!create) return { cart: null, customerId: null };
  const fresh = randomToken();
  const [cart] = await db
    .insert(carts)
    .values({ guestTokenHash: sha256(fresh) })
    .returning();
  setCartCookie(reply, fresh, cookieSecure);
  return { cart: cart ?? null, customerId: null };
}

/**
 * After sign-in: moves the guest cart's lines into the customer's cart (quantities add up, capped
 * at 20) and forgets the guest cart.
 */
export async function mergeGuestCart(
  db: Writer,
  request: FastifyRequest,
  reply: FastifyReply,
  customerId: string,
): Promise<void> {
  const token = request.cookies[CART_COOKIE];
  if (!token) return;
  reply.clearCookie(CART_COOKIE, { path: "/" });
  const [guest] = await db
    .select()
    .from(carts)
    .where(eq(carts.guestTokenHash, sha256(token)));
  if (!guest) return;
  const lines = await db.select().from(cartLines).where(eq(cartLines.cartId, guest.id));
  if (lines.length > 0) {
    let [target] = await db.select().from(carts).where(eq(carts.customerId, customerId));
    if (!target) {
      [target] = await db.insert(carts).values({ customerId, country: guest.country }).returning();
    }
    if (target) {
      for (const line of lines) {
        await db
          .insert(cartLines)
          .values({ cartId: target.id, variantId: line.variantId, qty: line.qty })
          .onConflictDoUpdate({
            target: [cartLines.cartId, cartLines.variantId],
            set: { qty: sql`least(${cartLines.qty} + ${line.qty}, 20)` },
          });
      }
    }
  }
  await db.delete(carts).where(eq(carts.id, guest.id));
}

export type PricedLine = CartLine & { productId: string; sourcing: typeof products.$inferSelect.sourcing };

/** Cart lines with current catalogue data; `available` says whether they can be bought for `country`. */
export async function pricedLines(db: Database, cartId: string, country: Country): Promise<PricedLine[]> {
  const rows = await db
    .select({
      variantId: cartLines.variantId,
      qty: cartLines.qty,
      sku: variants.sku,
      version: variants.version,
      priceCents: variants.priceCents,
      variantActive: variants.active,
      supplierAvailable: supplierAvailable(),
      productId: products.id,
      slug: products.slug,
      title: products.title,
      status: products.status,
      sourcing: products.sourcing,
      dispatchBg: productCompliance.dispatchEstimateBg,
      dispatchEn: productCompliance.dispatchEstimateEn,
      regions: productCompliance.deliveryRegions,
    })
    .from(cartLines)
    .innerJoin(variants, eq(variants.id, cartLines.variantId))
    .innerJoin(products, eq(products.id, variants.productId))
    .leftJoin(productCompliance, eq(productCompliance.productId, products.id))
    .where(eq(cartLines.cartId, cartId))
    .orderBy(cartLines.addedAt);
  return rows.map((r) => ({
    variantId: r.variantId,
    productId: r.productId,
    slug: r.slug,
    title: r.title,
    version: r.version,
    sku: r.sku,
    sourcing: r.sourcing,
    priceCents: r.priceCents,
    qty: r.qty,
    lineTotalCents: r.priceCents * r.qty,
    dispatchEstimate: { bg: r.dispatchBg ?? "", en: r.dispatchEn ?? "" },
    available:
      r.status === "published" &&
      r.variantActive &&
      r.supplierAvailable &&
      ((r.regions ?? []) as string[]).includes(country),
  }));
}

/** Prices the available lines with the admin settings (delivery fee per country, OSS date). */
export async function priceCart(
  db: Database,
  lines: readonly { priceCents: number; qty: number; available: boolean }[],
  country: "BG" | "RO" | "GR",
  signedIn: boolean,
  now = new Date(),
) {
  const company = await loadCompanySettings(db);
  const shippingFeeCents = company.deliveryFeesCents[country];
  const vatCountry = vatCountryFor(country, businessDay(now), company.ossEffectiveFrom);
  const quote = quoteCart(
    lines.filter((l) => l.available).map((l) => ({ priceCents: l.priceCents, qty: l.qty })),
    country,
    0,
    now,
    { shippingFeeCents, vatCountry },
  );
  return {
    quote: {
      goodsCents: quote.goodsCents,
      shippingCents: quote.shippingCents,
      totalCents: quote.totalCents,
      vatRate: quote.vatRate,
      vatCents: quote.vatCents,
      // Kummies are for accounts only (A1).
      kummies: signedIn ? quote.kummies : 0,
      kummiesBaseCents: quote.kummiesBaseCents,
      shippingFeeCents,
      freeShippingFromCents: FREE_SHIPPING_FROM_CENTS,
    },
    vatCountry,
  };
}

export async function cartView(db: Database, cart: CartRow | null, signedIn: boolean): Promise<Cart> {
  const country = cart?.country ?? "BG";
  const lines = cart ? await pricedLines(db, cart.id, country) : [];
  const { quote } = await priceCart(db, lines, country, signedIn);
  return {
    lines: lines.map(({ productId: _p, sourcing: _s, ...line }) => line),
    country,
    count: lines.reduce((sum, l) => sum + l.qty, 0),
    quote,
  };
}

/** Removes bought variants from a cart after payment. */
export async function clearBought(db: Writer, cartId: string, variantIds: string[]): Promise<void> {
  if (variantIds.length === 0) return;
  await db
    .delete(cartLines)
    .where(and(eq(cartLines.cartId, cartId), inArray(cartLines.variantId, variantIds)));
}
