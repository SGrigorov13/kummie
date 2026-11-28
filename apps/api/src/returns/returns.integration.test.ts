import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { addDays, businessDay } from "@kummie/core";
import type { LoginResponse, OrderDetail, ReturnList } from "@kummie/contracts";
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
import {
  orderEvents,
  orderLines,
  orders,
  payments,
  products,
  refunds,
  salesDocuments,
  settings,
  variants,
} from "../db/schema";
import { seed } from "../db/seed";
import { processDueJobs } from "../jobs/outbox";

/** Same safety rule as the other database tests: only databases named *_test, which are wiped. */
const url = process.env.TEST_DATABASE_URL;
const safe = !!url && /\/[^/?]+_test(\?|$)/.test(url);

const WEB = "http://localhost:3000";
const ADMIN = "http://localhost:5180";
const STAFF_PASSWORD = "staff-test-Passw0rd!";
const ADDRESS = {
  name: "Елена Георгиева",
  line1: "ул. Витоша 5",
  line2: null,
  city: "Пловдив",
  postcode: "4000",
  country: "BG",
  phone: "+359 888 765 432",
};

describe.skipIf(!safe)("Withdrawal and returns (D-070) on PostgreSQL", () => {
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
  let staffCookie = "";
  const today = businessDay(new Date());

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
      remoteAddress: `10.5.${Math.floor(++ip / 250)}.${ip % 250}`,
      ...(payload === undefined ? {} : { payload: payload as object }),
      headers: { origin, ...headers },
    });
  }
  const staff = (method: "GET" | "POST" | "PUT", path: string, payload?: unknown) =>
    call(method, path, payload, { cookie: staffCookie }, ADMIN);
  async function deliver() {
    outbox.length = 0;
    await processDueJobs(handle.db, accountJobHandlers(email), { log: { info: () => {}, error: () => {} } });
    return [...outbox];
  }

  /** A guest buys `qty` units, pays, and the order is delivered `daysAgo` days ago. */
  async function deliveredOrder(qty: number, daysAgo = 0) {
    const add = await call("PUT", "/cart/lines", { variantId, qty, add: true });
    const cookie = add.cookies.find((c) => c.name === "kummie_cart");
    const order = (
      await call(
        "POST",
        "/checkout",
        { email: "elena@kummie.test", locale: "bg", address: ADDRESS, invoice: null, acceptTerms: true },
        { cookie: `kummie_cart=${cookie?.value}` },
      )
    ).json() as { orderId: string; orderKey: string; redirectUrl: string; number: string };
    const sessionId = decodeURIComponent(order.redirectUrl.split("/fake-pay/")[1] ?? "");
    await app.inject({
      method: "POST",
      url: `/fake-pay/${encodeURIComponent(sessionId)}/pay`,
      payload: "x=1",
      headers: { "content-type": "text/plain" },
    });
    const key = { "x-order-key": order.orderKey };
    const before = (await call("GET", `/orders/${order.orderId}`, undefined, key)).json() as OrderDetail;
    await handle.db.update(orders).set({ status: "delivered" }).where(eq(orders.id, order.orderId));
    await handle.db.insert(orderEvents).values({
      orderId: order.orderId,
      type: "operations",
      fromStatus: "out_for_delivery",
      toStatus: "delivered",
      actor: "system",
      at: new Date(Date.now() - daysAgo * 86_400_000),
    });
    const [line] = await handle.db.select().from(orderLines).where(eq(orderLines.orderId, order.orderId));
    return { ...order, key, before, lineId: line?.id ?? "", unit: line?.unitPriceCents ?? 0 };
  }

  beforeAll(async () => {
    handle = createDatabase(url as string, 4);
    await handle.db.execute(sql`drop schema if exists public cascade`);
    await handle.db.execute(sql`drop schema if exists drizzle cascade`);
    await handle.db.execute(sql`create schema public`);
    await migrate(handle.db, { migrationsFolder: resolve(import.meta.dirname, "../../drizzle") });
    await seed(handle.db);
    await handle.db.insert(settings).values([
      { key: "company", value: { contactEmail: "hello@kummie.eu" } },
      {
        key: "operations",
        value: {
          hub: { name: "СГ Корпорейшън — пункт", line1: "ул. Пункт 1", city: "София", postcode: "1000" },
        },
      },
    ]);
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
        operations: { db: handle.db, webUrl: WEB, supplier: { name: "none" } as never, carriers: [] },
      },
    });
    const [row] = await handle.db
      .select({ id: variants.id })
      .from(variants)
      .innerJoin(products, eq(products.id, variants.productId))
      .where(eq(products.status, "published"))
      .limit(1);
    variantId = row?.id ?? "";
    await createStaff(handle.db, {
      email: "hub@kummie.test",
      name: "Hub",
      role: "admin",
      password: STAFF_PASSWORD,
    });
    const login = (
      await call(
        "POST",
        "/admin-api/auth/login",
        { email: "hub@kummie.test", password: STAFF_PASSWORD },
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
  });

  afterAll(async () => {
    await app?.close();
    await handle?.close();
  });

  it("takes back part of an order, then the rest with the delivery", async () => {
    const order = await deliveredOrder(2);
    expect(order.before.withdrawal).toBeNull(); // not delivered at that point
    const detail = (
      await call("GET", `/orders/${order.orderId}`, undefined, order.key)
    ).json() as OrderDetail;
    expect(detail.withdrawal).toEqual({
      until: addDays(today, 14),
      lines: [expect.objectContaining({ orderLineId: order.lineId, returnableQty: 2 })],
    });

    const one = { courier: "econt", lines: [{ orderLineId: order.lineId, qty: 1 }], reason: null };
    expect(
      (
        await call(
          "POST",
          `/orders/${order.orderId}/returns`,
          { ...one, lines: [{ orderLineId: order.lineId, qty: 3 }] },
          order.key,
        )
      ).statusCode,
    ).toBe(409);
    expect((await call("POST", `/orders/${order.orderId}/returns`, one)).statusCode).toBe(404);
    const requested = await call("POST", `/orders/${order.orderId}/returns`, one, order.key);
    expect(requested.statusCode).toBe(200);
    const after = requested.json() as OrderDetail;
    expect(after.returns).toMatchObject([{ number: "RET-0001", status: "requested", courier: "econt" }]);
    expect(after.withdrawal?.lines[0]?.returnableQty).toBe(1);
    const mails = await deliver();
    const confirmation = mails.find((m) => m.to === "elena@kummie.test" && m.subject.startsWith("Отказ"));
    expect(confirmation?.subject).toBe(`Отказ RET-0001 по поръчка ${order.number}`);
    expect(confirmation?.text).toContain("ул. Пункт 1");
    expect(confirmation?.text).toContain("Еконт");
    expect(mails.find((m) => m.to === "hello@kummie.eu")?.subject).toBe(
      `Отказ RET-0001 по поръчка ${order.number}`,
    );

    // At the hub: arrived, checked, refunded by an admin.
    let list = (await staff("GET", "/admin-api/hub/returns")).json() as ReturnList;
    const ret = list.items[0];
    expect(ret).toMatchObject({ number: "RET-0001", status: "requested", refundDueOn: addDays(today, 14) });
    const decision = {
      lines: [{ id: ret?.lines[0]?.id, decision: "accepted", refuseReason: null, disposition: "keep" }],
    };
    expect((await staff("PUT", `/admin-api/hub/returns/${ret?.id}/decision`, decision)).statusCode).toBe(409);
    await staff("POST", `/admin-api/hub/returns/${ret?.id}/received`, {});
    expect((await staff("POST", `/admin-api/hub/returns/${ret?.id}/refund`, {})).statusCode).toBe(409);
    list = (await staff("PUT", `/admin-api/hub/returns/${ret?.id}/decision`, decision)).json() as ReturnList;
    expect(list.items[0]).toMatchObject({ status: "received", refundCents: order.unit });
    const refunded = await staff("POST", `/admin-api/hub/returns/${ret?.id}/refund`, {});
    expect(refunded.statusCode).toBe(200);
    expect((refunded.json() as ReturnList).items[0]?.status).toBe("refunded");
    const [refund] = await handle.db.select().from(refunds).where(eq(refunds.orderId, order.orderId));
    expect(refund).toMatchObject({ amountCents: order.unit, reason: "withdrawal" });
    const storno = (
      await handle.db.select().from(salesDocuments).where(eq(salesDocuments.orderId, order.orderId))
    ).find((d) => d.kind === "receipt_storno");
    expect(storno?.snapshot.reason).toContain("чл. 50 ЗЗП");
    const [closedMail] = await deliver();
    expect(closedMail?.subject).toBe("Отказ RET-0001: решение");
    expect(closedMail?.attachments?.map((a) => a.filename)).toEqual([
      expect.stringMatching(/^kummie-storno-/),
    ]);
    expect((await handle.db.select().from(orders).where(eq(orders.id, order.orderId)))[0]?.status).toBe(
      "delivered",
    );

    // The last unit: the delivery goes back too and the order ends as refunded.
    await call("POST", `/orders/${order.orderId}/returns`, { ...one, courier: "boxnow" }, order.key);
    list = (await staff("GET", "/admin-api/hub/returns")).json() as ReturnList;
    const second = list.items.find((r) => r.number === "RET-0002");
    await staff("POST", `/admin-api/hub/returns/${second?.id}/received`, {});
    list = (
      await staff("PUT", `/admin-api/hub/returns/${second?.id}/decision`, {
        lines: [
          { id: second?.lines[0]?.id, decision: "accepted", refuseReason: null, disposition: "to_supplier" },
        ],
      })
    ).json() as ReturnList;
    const [{ shippingCents } = { shippingCents: 0 }] = await handle.db
      .select({ shippingCents: orders.shippingCents })
      .from(orders)
      .where(eq(orders.id, order.orderId));
    expect(list.items.find((r) => r.id === second?.id)?.refundCents).toBe(order.unit + shippingCents);
    await staff("POST", `/admin-api/hub/returns/${second?.id}/refund`, {});
    const [o] = await handle.db.select().from(orders).where(eq(orders.id, order.orderId));
    expect(o?.status).toBe("refunded");
    const [payment] = await handle.db.select().from(payments).where(eq(payments.orderId, order.orderId));
    expect(payment?.status).toBe("refunded");
    const final = (await call("GET", `/orders/${order.orderId}`, undefined, order.key)).json() as OrderDetail;
    expect(final.withdrawal).toBeNull();
    expect(final.returns.map((r) => r.status)).toEqual(["refunded", "refunded"]);
  });

  it("refuses an opened sealed album with the reason, and closes after 14 days", async () => {
    const order = await deliveredOrder(1, 10);
    await call(
      "POST",
      `/orders/${order.orderId}/returns`,
      { courier: "speedy", lines: [{ orderLineId: order.lineId, qty: 1 }], reason: "Не ми харесва" },
      order.key,
    );
    await deliver();
    let list = (await staff("GET", "/admin-api/hub/returns")).json() as ReturnList;
    const ret = list.items.find((r) => r.status === "requested");
    await staff("POST", `/admin-api/hub/returns/${ret?.id}/received`, {});
    const noReason = {
      lines: [{ id: ret?.lines[0]?.id, decision: "refused", refuseReason: null, disposition: null }],
    };
    expect((await staff("PUT", `/admin-api/hub/returns/${ret?.id}/decision`, noReason)).statusCode).toBe(409);
    await staff("PUT", `/admin-api/hub/returns/${ret?.id}/decision`, {
      lines: [
        {
          id: ret?.lines[0]?.id,
          decision: "refused",
          refuseReason: "Запечатаният албум е отворен (чл. 57 ЗЗП).",
          disposition: null,
        },
      ],
    });
    list = (await staff("POST", `/admin-api/hub/returns/${ret?.id}/refund`, {})).json() as ReturnList;
    expect(list.items.find((r) => r.id === ret?.id)?.status).toBe("rejected");
    expect(await handle.db.select().from(refunds).where(eq(refunds.orderId, order.orderId))).toEqual([]);
    const [mail] = await deliver();
    expect(mail?.text).toContain("Запечатаният албум е отворен");

    // 14 days after delivery the button is gone.
    await handle.db
      .update(orderEvents)
      .set({ at: new Date(Date.now() - 20 * 86_400_000) })
      .where(eq(orderEvents.orderId, order.orderId));
    const late = (await call("GET", `/orders/${order.orderId}`, undefined, order.key)).json() as OrderDetail;
    expect(late.withdrawal).toBeNull();
    expect(
      (
        await call(
          "POST",
          `/orders/${order.orderId}/returns`,
          { courier: "speedy", lines: [{ orderLineId: order.lineId, qty: 1 }], reason: null },
          order.key,
        )
      ).json().error,
    ).toBe("withdrawal_not_possible");
  });
});
