import { resolve } from "node:path";
import { addMonths, businessDay } from "@kummie/core";
import { and, eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FakePaymentProvider } from "../adapters/fake-payment";
import type { EmailAdapter, EmailMessage } from "../adapters/email";
import { accountJobHandlers } from "../accounts/erasure";
import { buildApp } from "../app";
import { createDatabase, type DatabaseHandle } from "../db/client";
import {
  jobs,
  kummiesLedger,
  orderEvents,
  orders,
  payments,
  products,
  settings,
  variants,
} from "../db/schema";
import { seed } from "../db/seed";
import { processDueJobs } from "../jobs/outbox";

/** Same safety rule as the other database tests: only databases named *_test, which are wiped. */
const url = process.env.TEST_DATABASE_URL;
const safe = !!url && /\/[^/?]+_test(\?|$)/.test(url);

const WEB = "http://localhost:3000";
const PASSWORD = "a long test-only password";
const ADDRESS = {
  name: "Иван Иванов",
  line1: "ул. Шипка 1",
  line2: null,
  city: "София",
  postcode: "1000",
  country: "BG",
  phone: "+359 888 123 456",
};

describe.skipIf(!safe)("cart, checkout and payment on PostgreSQL", () => {
  let handle: DatabaseHandle;
  let app: ReturnType<typeof buildApp>;
  const fake = new FakePaymentProvider("http://localhost:3001/fake-pay", "test-secret");
  const outbox: EmailMessage[] = [];
  const email: EmailAdapter = {
    name: "memory",
    send: async (m) => {
      outbox.push(m);
      return { messageId: String(outbox.length), accepted: true };
    },
  };
  let ip = 0;
  let cheap: { id: string; priceCents: number; productId: string };

  beforeAll(async () => {
    handle = createDatabase(url as string, 2);
    await handle.db.execute(sql`drop schema if exists public cascade`);
    await handle.db.execute(sql`drop schema if exists drizzle cascade`);
    await handle.db.execute(sql`create schema public`);
    await migrate(handle.db, { migrationsFolder: resolve(import.meta.dirname, "../../drizzle") });
    await seed(handle.db);
    const deps = { db: handle.db, email, webUrl: WEB, allowedOrigins: [WEB], cookieSecure: false };
    app = buildApp({
      logger: false,
      checkDb: async () => "ok",
      accounts: deps,
      shop: { ...deps, payments: fake, fakePayments: fake },
    });
    const [row] = await handle.db
      .select({ id: variants.id, priceCents: variants.priceCents, productId: variants.productId })
      .from(variants)
      .innerJoin(products, eq(products.id, variants.productId))
      .where(and(eq(products.status, "published"), sql`${variants.priceCents} < 4000`))
      .orderBy(variants.priceCents)
      .limit(1);
    if (!row) throw new Error("seed has no cheap published product");
    cheap = row;
  });

  afterAll(async () => {
    await app?.close();
    await handle?.close();
  });

  const call = (
    method: "GET" | "POST" | "PUT",
    path: string,
    payload?: unknown,
    headers: Record<string, string> = {},
  ) =>
    app.inject({
      method,
      url: path,
      remoteAddress: `10.1.${Math.floor(++ip / 250)}.${ip % 250}`,
      ...(payload === undefined ? {} : { payload: payload as object }),
      headers: { origin: WEB, ...headers },
    });
  const cookieOf = (res: Awaited<ReturnType<typeof call>>, name: string) => {
    const c = res.cookies.find((x) => x.name === name);
    return c ? `${name}=${c.value}` : "";
  };
  const deliver = async () => {
    outbox.length = 0;
    await processDueJobs(handle.db, accountJobHandlers(email), { log: { info: () => {}, error: () => {} } });
    return [...outbox];
  };
  const payOnFakePage = (redirectUrl: string, action: "pay" | "fail") => {
    const sessionId = decodeURIComponent(redirectUrl.split("/fake-pay/")[1] ?? "");
    return app.inject({
      method: "POST",
      url: `/fake-pay/${encodeURIComponent(sessionId)}/${action}`,
      payload: "x=1",
      headers: { "content-type": "text/plain" },
    });
  };

  it("keeps a guest cart by cookie and prices it with the delivery fee and VAT", async () => {
    const add = await call("PUT", "/cart/lines", { variantId: cheap.id, qty: 2, add: true });
    expect(add.statusCode).toBe(200);
    const cookie = cookieOf(add, "kummie_cart");
    expect(cookie).not.toBe("");
    const cart = (await call("GET", "/cart", undefined, { cookie })).json();
    expect(cart.count).toBe(2);
    const goods = cheap.priceCents * 2;
    expect(cart.quote).toMatchObject({ goodsCents: goods, vatRate: 0.2, kummies: 0 });
    expect(cart.quote.shippingCents).toBe(goods >= 8000 ? 0 : 490);
  });

  it("uses Bulgarian VAT before the OSS date and the admin's delivery fee per country", async () => {
    const add = await call("PUT", "/cart/lines", { variantId: cheap.id, qty: 1, add: true });
    const cookie = cookieOf(add, "kummie_cart");
    let cart = (await call("PUT", "/cart/country", { country: "RO" }, { cookie })).json();
    expect(cart.quote.vatRate).toBe(0.2);
    await handle.db.insert(settings).values({
      key: "company",
      value: { ossEffectiveFrom: "2026-01-01", deliveryFeesCents: { BG: 490, RO: 690, GR: 790 } },
    });
    cart = (await call("GET", "/cart", undefined, { cookie })).json();
    expect(cart.quote).toMatchObject({ vatRate: 0.21, shippingCents: 690 });
    await handle.db.delete(settings).where(eq(settings.key, "company"));
  });

  it("checks out a guest, pays on the test page and confirms by webhook only once", async () => {
    const add = await call("PUT", "/cart/lines", { variantId: cheap.id, qty: 1, add: true });
    const cookie = cookieOf(add, "kummie_cart");
    const checkout = await call(
      "POST",
      "/checkout",
      { email: "guest@kummie.test", locale: "bg", address: ADDRESS, invoice: null, acceptTerms: true },
      { cookie },
    );
    expect(checkout.statusCode).toBe(200);
    const { orderId, number, orderKey, redirectUrl } = checkout.json();
    expect(number).toMatch(/^KUM-\d+$/);
    expect(orderKey).toBeTruthy();

    expect((await call("GET", `/orders/${orderId}`)).statusCode).toBe(404);
    const pending = (await call("GET", `/orders/${orderId}`, undefined, { "x-order-key": orderKey })).json();
    expect(pending).toMatchObject({
      status: "pending_payment",
      canPay: true,
      totalCents: cheap.priceCents + 490,
    });
    expect(pending.lines[0].vatCents + (await shippingVat(orderId))).toBe(pending.vatCents);

    const page = await app.inject({ method: "GET", url: new URL(redirectUrl).pathname });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain("Тестово плащане");

    const paid = await payOnFakePage(redirectUrl, "pay");
    expect(paid.statusCode).toBe(303);
    expect(paid.headers.location).toBe(`${WEB}/bg/orders/${orderId}?paid=1#k=${orderKey}`);
    const detail = (await call("GET", `/orders/${orderId}`, undefined, { "x-order-key": orderKey })).json();
    expect(detail).toMatchObject({ status: "paid", canPay: false, kummies: 0 });
    expect(detail.events.map((e: { status: string }) => e.status)).toEqual(["pending_payment", "paid"]);
    expect((await call("GET", "/cart", undefined, { cookie })).json().count).toBe(0);

    // The provider may repeat a webhook; nothing happens twice.
    const [payment] = await handle.db.select().from(payments).where(eq(payments.orderId, orderId));
    const again = fake.webhookFor("authorize", payment?.sessionId ?? "");
    const repeat = await app.inject({
      method: "POST",
      url: "/payments/webhook/fake",
      payload: again.rawBody,
      headers: { ...again.headers, "content-type": "application/json" },
    });
    expect(repeat.json()).toEqual({ ok: true, result: "ignored" });
    const unsigned = await app.inject({
      method: "POST",
      url: "/payments/webhook/fake",
      payload: again.rawBody,
      headers: { "content-type": "application/json" },
    });
    expect(unsigned.statusCode).toBe(400);

    const mails = await deliver();
    expect(mails).toHaveLength(1);
    expect(mails[0]?.subject).toBe(`Поръчка ${number} е платена`);
    expect(mails[0]?.text).toContain("14 дни");
  });

  async function shippingVat(orderId: string) {
    const [row] = await handle.db
      .select({ v: orders.shippingVatCents })
      .from(orders)
      .where(eq(orders.id, orderId));
    return row?.v ?? 0;
  }

  it("keeps the order payable after a declined payment", async () => {
    const add = await call("PUT", "/cart/lines", { variantId: cheap.id, qty: 1, add: true });
    const cookie = cookieOf(add, "kummie_cart");
    const { orderId, orderKey, redirectUrl } = (
      await call(
        "POST",
        "/checkout",
        { email: "decline@kummie.test", locale: "en", address: ADDRESS, invoice: null, acceptTerms: true },
        { cookie },
      )
    ).json();
    const declined = await payOnFakePage(redirectUrl, "fail");
    expect(declined.headers.location).toContain("cancelled=1");
    const detail = (await call("GET", `/orders/${orderId}`, undefined, { "x-order-key": orderKey })).json();
    expect(detail).toMatchObject({ status: "pending_payment", canPay: true });
    const events = await handle.db.select().from(orderEvents).where(eq(orderEvents.orderId, orderId));
    expect(events.map((e) => e.type)).toEqual(["created", "payment_failed"]);
    const retry = await call("POST", `/orders/${orderId}/pay`, {}, { "x-order-key": orderKey });
    expect(retry.statusCode).toBe(200);
    expect((await payOnFakePage(retry.json().redirectUrl, "pay")).statusCode).toBe(303);
    expect(
      (await call("GET", `/orders/${orderId}`, undefined, { "x-order-key": orderKey })).json().status,
    ).toBe("paid");
  });

  it("merges the guest cart on sign-in and earns Kummies for account orders", async () => {
    await call("POST", "/auth/signup", {
      email: "buyer@kummie.test",
      password: PASSWORD,
      name: "Buyer",
      birthDate: "1990-05-05",
      locale: "bg",
      acceptTerms: true,
    });
    const verifyMail = (await deliver()).find((m) => m.to === "buyer@kummie.test");
    const token = /#t=([A-Za-z0-9_-]+)/.exec(verifyMail?.text ?? "")?.[1] ?? "";
    await call("POST", "/auth/verify", { token });

    // Enough items to pass the €30 Kummies minimum (D-027).
    const qty = Math.min(20, Math.ceil(3100 / cheap.priceCents));
    const add = await call("PUT", "/cart/lines", { variantId: cheap.id, qty, add: true });
    const guestCookie = cookieOf(add, "kummie_cart");
    const signin = await call(
      "POST",
      "/auth/signin",
      { email: "buyer@kummie.test", password: PASSWORD },
      { cookie: guestCookie },
    );
    const session = cookieOf(signin, "kummie_session");
    const cart = (await call("GET", "/cart", undefined, { cookie: session })).json();
    expect(cart.count).toBe(qty);
    expect(cart.quote.kummies).toBe(Math.floor((cheap.priceCents * qty) / 100));

    const checkout = (
      await call(
        "POST",
        "/checkout",
        {
          locale: "bg",
          address: ADDRESS,
          invoice: {
            kind: "company",
            name: "Тест ЕООД",
            eik: "123456789",
            vatNumber: "BG123456789",
            address: "София",
          },
          acceptTerms: true,
          saveAddress: true,
        },
        { cookie: session },
      )
    ).json();
    expect(checkout.orderKey).toBeNull();
    await payOnFakePage(checkout.redirectUrl, "pay");

    const [earn] = await handle.db
      .select()
      .from(kummiesLedger)
      .where(eq(kummiesLedger.orderId, checkout.orderId));
    const today = businessDay(new Date());
    expect(earn).toMatchObject({
      kind: "earn",
      amount: cart.quote.kummies,
      earnedOn: today,
      validUntil: addMonths(today, 6),
    });
    const mine = (await call("GET", "/account/orders", undefined, { cookie: session })).json();
    expect(mine.items).toEqual([expect.objectContaining({ id: checkout.orderId, status: "paid" })]);
    const detail = (await call("GET", `/orders/${checkout.orderId}`, undefined, { cookie: session })).json();
    expect(detail.invoice).toMatchObject({ kind: "company", eik: "123456789" });
    expect(
      (await call("GET", "/account/addresses", undefined, { cookie: session })).json().items,
    ).toHaveLength(1);
  });

  it("refuses checkout when a product was unpublished meanwhile", async () => {
    const add = await call("PUT", "/cart/lines", { variantId: cheap.id, qty: 1, add: true });
    const cookie = cookieOf(add, "kummie_cart");
    await handle.db.update(products).set({ status: "draft" }).where(eq(products.id, cheap.productId));
    const cart = (await call("GET", "/cart", undefined, { cookie })).json();
    expect(cart.lines[0].available).toBe(false);
    expect(cart.quote.goodsCents).toBe(0);
    const checkout = await call(
      "POST",
      "/checkout",
      { email: "late@kummie.test", locale: "bg", address: ADDRESS, invoice: null, acceptTerms: true },
      { cookie },
    );
    expect(checkout.statusCode).toBe(409);
    expect(checkout.json().error).toBe("cart_changed");
    await handle.db.update(products).set({ status: "published" }).where(eq(products.id, cheap.productId));
    expect(await handle.db.select().from(jobs).where(eq(jobs.status, "failed"))).toHaveLength(0);
  });
});
