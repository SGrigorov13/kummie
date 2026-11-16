import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import type { LoginResponse } from "@kummie/contracts";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { EmailAdapter, EmailMessage } from "../adapters/email";
import { FakePaymentProvider } from "../adapters/fake-payment";
import { accountJobHandlers } from "../accounts/erasure";
import { createStaff } from "../admin/staff-cli";
import { buildApp } from "../app";
import { createSecretBox } from "../auth/crypto";
import { timeStep, totpCode } from "../auth/totp";
import { createDatabase, type DatabaseHandle } from "../db/client";
import { auditLog, kummiesLedger, products, refunds, variants } from "../db/schema";
import { seed } from "../db/seed";
import { processDueJobs } from "../jobs/outbox";

/** Same safety rule as the other database tests: only databases named *_test, which are wiped. */
const url = process.env.TEST_DATABASE_URL;
const safe = !!url && /\/[^/?]+_test(\?|$)/.test(url);

const WEB = "http://localhost:3000";
const ADMIN = "http://localhost:5173";
const PASSWORD = "a long test-only password";
const STAFF_PASSWORD = "staff-test-Passw0rd!";
const ADDRESS = {
  name: "Иван Иванов",
  line1: "ул. Шипка 1",
  line2: null,
  city: "София",
  postcode: "1000",
  country: "BG",
  phone: "+359 888 123 456",
};

describe.skipIf(!safe)("cancellation, refunds and admin orders on PostgreSQL", () => {
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
  let variantId = "";
  let qty = 1;
  let staffCookie = "";
  let customerCookie = "";

  beforeAll(async () => {
    handle = createDatabase(url as string, 2);
    await handle.db.execute(sql`drop schema if exists public cascade`);
    await handle.db.execute(sql`drop schema if exists drizzle cascade`);
    await handle.db.execute(sql`create schema public`);
    await migrate(handle.db, { migrationsFolder: resolve(import.meta.dirname, "../../drizzle") });
    await seed(handle.db);
    const accounts = { db: handle.db, email, webUrl: WEB, allowedOrigins: [WEB], cookieSecure: false };
    const shop = { ...accounts, payments: fake, fakePayments: fake };
    app = buildApp({
      logger: false,
      checkDb: async () => "ok",
      accounts,
      shop,
      admin: {
        db: handle.db,
        secretBox: createSecretBox(randomBytes(32).toString("base64")),
        allowedOrigins: [ADMIN],
        cookieSecure: false,
        shop,
      },
    });
    // Enough items for €30+, so a paid order earns Kummies (D-027).
    const [row] = await handle.db
      .select({ id: variants.id, priceCents: variants.priceCents })
      .from(variants)
      .innerJoin(products, eq(products.id, variants.productId))
      .where(eq(products.status, "published"))
      .limit(1);
    if (!row) throw new Error("seed has no published product");
    variantId = row.id;
    qty = Math.min(20, Math.ceil(3100 / row.priceCents));

    await createStaff(handle.db, {
      email: "boss@kummie.test",
      name: "Boss",
      role: "admin",
      password: STAFF_PASSWORD,
    });
    const login = (
      await call(
        "POST",
        "/admin-api/auth/login",
        { email: "boss@kummie.test", password: STAFF_PASSWORD },
        {},
        ADMIN,
      )
    ).json() as LoginResponse;
    if (login.step !== "enroll") throw new Error("expected enrolment");
    const enrolled = await call(
      "POST",
      "/admin-api/auth/enroll",
      { challenge: login.challenge, code: totpCode(login.secret, timeStep()) },
      {},
      ADMIN,
    );
    staffCookie = String(enrolled.headers["set-cookie"]).split(";")[0] ?? "";

    await call("POST", "/auth/signup", {
      email: "fan@kummie.test",
      password: PASSWORD,
      name: "Fan",
      birthDate: "1995-01-01",
      locale: "bg",
      acceptTerms: true,
    });
    const verify = (await deliver()).find((m) => m.to === "fan@kummie.test");
    const token = /#t=([A-Za-z0-9_-]+)/.exec(verify?.text ?? "")?.[1] ?? "";
    const verified = await call("POST", "/auth/verify", { token });
    customerCookie = cookieOf(verified, "kummie_session");
  });

  afterAll(async () => {
    await app?.close();
    await handle?.close();
  });

  function call(
    method: "GET" | "POST" | "PUT",
    path: string,
    payload?: unknown,
    headers: Record<string, string> = {},
    origin = WEB,
  ) {
    return app.inject({
      method,
      url: path,
      remoteAddress: `10.2.${Math.floor(++ip / 250)}.${ip % 250}`,
      ...(payload === undefined ? {} : { payload: payload as object }),
      headers: { origin, ...headers },
    });
  }
  function cookieOf(res: Awaited<ReturnType<typeof call>>, name: string) {
    const c = res.cookies.find((x) => x.name === name);
    return c ? `${name}=${c.value}` : "";
  }
  async function deliver() {
    outbox.length = 0;
    await processDueJobs(handle.db, accountJobHandlers(email), { log: { info: () => {}, error: () => {} } });
    return [...outbox];
  }
  async function pay(redirectUrl: string) {
    const sessionId = decodeURIComponent(redirectUrl.split("/fake-pay/")[1] ?? "");
    await app.inject({
      method: "POST",
      url: `/fake-pay/${encodeURIComponent(sessionId)}/pay`,
      payload: "x=1",
      headers: { "content-type": "text/plain" },
    });
  }
  /** Places and (optionally) pays an order for the signed-in customer. */
  async function order(paid: boolean) {
    await call("PUT", "/cart/lines", { variantId, qty, add: true }, { cookie: customerCookie });
    const checkout = (
      await call(
        "POST",
        "/checkout",
        { locale: "bg", address: ADDRESS, invoice: null, acceptTerms: true },
        { cookie: customerCookie },
      )
    ).json();
    if (paid) await pay(checkout.redirectUrl);
    return checkout.orderId as string;
  }
  const staff = (method: "GET" | "POST", path: string, payload?: unknown) =>
    call(method, path, payload, { cookie: staffCookie }, ADMIN);

  it("cancels an unpaid order without a refund", async () => {
    const id = await order(false);
    const cancelled = await call("POST", `/orders/${id}/cancel`, {}, { cookie: customerCookie });
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json()).toMatchObject({ status: "cancelled", canPay: false, canCancel: false });
    expect(await handle.db.select().from(refunds).where(eq(refunds.orderId, id))).toHaveLength(0);
  });

  it("refunds a paid order in full, revokes its Kummies and tells the customer", async () => {
    const id = await order(true);
    await deliver();
    const before = (await call("GET", `/orders/${id}`, undefined, { cookie: customerCookie })).json();
    expect(before).toMatchObject({ status: "paid", canCancel: true });
    expect(before.kummies).toBeGreaterThan(0);

    const res = await call("POST", `/orders/${id}/cancel`, {}, { cookie: customerCookie });
    expect(res.json()).toMatchObject({ status: "refunded", canCancel: false });
    expect(res.json().events.map((e: { status: string }) => e.status)).toEqual([
      "pending_payment",
      "paid",
      "cancelled",
      "refunded",
    ]);
    const [refund] = await handle.db.select().from(refunds).where(eq(refunds.orderId, id));
    expect(refund).toMatchObject({
      amountCents: before.totalCents,
      reason: "cancelled",
      status: "succeeded",
    });
    const ledger = await handle.db.select().from(kummiesLedger).where(eq(kummiesLedger.orderId, id));
    expect(ledger.map((l) => [l.kind, l.amount])).toHaveLength(2);
    expect(ledger.map((l) => [l.kind, l.amount])).toEqual(
      expect.arrayContaining([
        ["earn", before.kummies],
        ["revoke", -before.kummies],
      ]),
    );
    const mails = await deliver();
    expect(mails.map((m) => m.subject)).toEqual(
      [`${before.number}`].map((n) => `Поръчка ${n}: Сумата е върната изцяло.`),
    );
    expect(mails[0]?.text).toContain("върнахме");

    const again = await call("POST", `/orders/${id}/cancel`, {}, { cookie: customerCookie });
    expect(again.statusCode).toBe(409);
  });

  it("lets staff move an order along, e-mails only new customer steps, and blocks customer cancel once batched", async () => {
    const id = await order(true);
    await deliver();
    const list = (await staff("GET", "/admin-api/orders?status=paid")).json();
    expect(list.items.map((o: { id: string }) => o.id)).toContain(id);
    const detail = (await staff("GET", `/admin-api/orders/${id}`)).json();
    expect(detail.next).toEqual(["batched", "cancelled", "exception"]);
    expect(detail.payments).toEqual([expect.objectContaining({ status: "captured" })]);

    const refused = await staff("POST", `/admin-api/orders/${id}/status`, { to: "delivered" });
    expect(refused.statusCode).toBe(409);

    const batched = await staff("POST", `/admin-api/orders/${id}/status`, { to: "batched", note: "Batch 1" });
    expect(batched.json()).toMatchObject({
      status: "batched",
      next: ["ordered_from_supplier", "cancelled", "exception"],
    });
    expect(batched.json().history.at(-1)).toMatchObject({
      actor: expect.stringMatching(/^staff:/),
      note: "Batch 1",
    });
    await staff("POST", `/admin-api/orders/${id}/status`, { to: "ordered_from_supplier" });
    const mails = await deliver();
    // Two internal states, one customer step: a single e-mail.
    expect(mails.map((m) => m.subject)).toEqual([expect.stringContaining("В сборната поръчка")]);

    const late = await call("POST", `/orders/${id}/cancel`, {}, { cookie: customerCookie });
    expect(late.statusCode).toBe(409);
    const audits = await handle.db.select().from(auditLog).where(eq(auditLog.entityId, id));
    expect(audits).toHaveLength(2);
  });

  it("keeps the order screens away from customers and the shop origin", async () => {
    expect((await call("GET", "/admin-api/orders", undefined, { cookie: customerCookie })).statusCode).toBe(
      401,
    );
    const search = (await staff("GET", "/admin-api/orders?q=fan@kummie")).json();
    expect(search.total).toBeGreaterThanOrEqual(3);
  });
});
