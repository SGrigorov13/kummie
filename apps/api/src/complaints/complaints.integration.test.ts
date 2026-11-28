import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { addDays, businessDay, complaintDueOn } from "@kummie/core";
import type { ComplaintList, LoginResponse, OrderDetail } from "@kummie/contracts";
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
import { orderLines, orders, products, settings, variants } from "../db/schema";
import { seed } from "../db/seed";
import { processDueJobs } from "../jobs/outbox";
import { sendComplaintReminders } from "./service";

/** Same safety rule as the other database tests: only databases named *_test, which are wiped. */
const url = process.env.TEST_DATABASE_URL;
const safe = !!url && /\/[^/?]+_test(\?|$)/.test(url);

const WEB = "http://localhost:3000";
const ADMIN = "http://localhost:5180";
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

describe.skipIf(!safe)("Complaints register (D-069) on PostgreSQL", () => {
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
    method: "GET" | "POST",
    path: string,
    payload?: unknown,
    headers: Record<string, string> = {},
    origin = WEB,
  ) {
    return app.inject({
      method,
      url: path,
      remoteAddress: `10.4.${Math.floor(++ip / 250)}.${ip % 250}`,
      ...(payload === undefined ? {} : { payload: payload as object }),
      headers: { origin, ...headers },
    });
  }
  const staff = (method: "GET" | "POST", path: string, payload?: unknown) =>
    call(method, path, payload, { cookie: staffCookie }, ADMIN);
  async function deliver() {
    outbox.length = 0;
    await processDueJobs(handle.db, accountJobHandlers(email), { log: { info: () => {}, error: () => {} } });
    return [...outbox];
  }

  beforeAll(async () => {
    handle = createDatabase(url as string, 4);
    await handle.db.execute(sql`drop schema if exists public cascade`);
    await handle.db.execute(sql`drop schema if exists drizzle cascade`);
    await handle.db.execute(sql`create schema public`);
    await migrate(handle.db, { migrationsFolder: resolve(import.meta.dirname, "../../drizzle") });
    await seed(handle.db);
    await handle.db.insert(settings).values({ key: "company", value: { contactEmail: "hello@kummie.eu" } });
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
    const [row] = await handle.db
      .select({ id: variants.id })
      .from(variants)
      .innerJoin(products, eq(products.id, variants.productId))
      .where(eq(products.status, "published"))
      .limit(1);
    variantId = row?.id ?? "";
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
  });

  afterAll(async () => {
    await app?.close();
    await handle?.close();
  });

  it("registers the customer's complaint with a number, a deadline and e-mails", async () => {
    const add = await call("PUT" as "POST", "/cart/lines", { variantId, qty: 1, add: true });
    const cookie = add.cookies.find((c) => c.name === "kummie_cart");
    const order = (
      await call(
        "POST",
        "/checkout",
        { email: "ivan@kummie.test", locale: "bg", address: ADDRESS, invoice: null, acceptTerms: true },
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
    const [line] = await handle.db.select().from(orderLines).where(eq(orderLines.orderId, order.orderId));
    const body = {
      orderLineId: line?.id ?? null,
      description: "Кутията е смачкана, фотокартата липсва.",
      demand: "replacement",
    };

    // Not delivered yet: no complaint from the order page.
    expect((await call("POST", `/orders/${order.orderId}/complaints`, body, key)).statusCode).toBe(409);
    await handle.db.update(orders).set({ status: "delivered" }).where(eq(orders.id, order.orderId));
    expect((await call("POST", `/orders/${order.orderId}/complaints`, body)).statusCode).toBe(404);

    const res = await call("POST", `/orders/${order.orderId}/complaints`, body, key);
    expect(res.statusCode).toBe(200);
    const detail = res.json() as OrderDetail;
    expect(detail.canComplain).toBe(true);
    expect(detail.complaints).toEqual([
      {
        number: "RK-0001",
        status: "open",
        product: `${line?.title} (${line?.version})`,
        dueOn: complaintDueOn(today),
        outcome: null,
      },
    ]);
    await deliver();
    const mails = outbox;
    expect(
      mails.find((m) => m.to === "ivan@kummie.test" && m.subject.startsWith("Рекламация"))?.subject,
    ).toBe("Рекламация RK-0001 е приета");
    expect(mails.find((m) => m.to === "hello@kummie.eu")?.subject).toBe("Нова рекламация RK-0001");
  });

  it("takes complaints by phone, reminds before the deadline, closes with an answer", async () => {
    const receivedOn = addDays(today, -25);
    const input = {
      name: "Мария Петрова",
      email: "maria@kummie.test",
      phone: null,
      orderNumber: null,
      product: "Лайтстик",
      description: "Не светва след смяна на батериите.",
      demand: "repair",
      channel: "phone",
      receivedOn,
      locale: "bg",
    };
    expect(
      (await staff("POST", "/admin-api/complaints", { ...input, receivedOn: addDays(today, 1) })).statusCode,
    ).toBe(409);
    expect(
      (await staff("POST", "/admin-api/complaints", { ...input, orderNumber: "KUM-999999" })).statusCode,
    ).toBe(404);
    const added = await staff("POST", "/admin-api/complaints", input);
    expect(added.statusCode).toBe(200);
    const list = (added.json() as ComplaintList).items;
    expect(list.map((c) => [c.number, c.channel, c.dueOn])).toEqual([
      ["RK-0002", "phone", complaintDueOn(receivedOn)],
      ["RK-0001", "site", complaintDueOn(today)],
    ]);
    expect(list[0]).toMatchObject({ dueSoon: true, overdue: false, orderNumber: null });
    expect(list[1]?.orderNumber).toMatch(/^KUM-/);
    expect((await call("GET", "/admin-api/complaints", undefined, {}, ADMIN)).statusCode).toBe(401);

    // The day before the deadline: one reminder to the shop's mailbox, never twice.
    await deliver();
    const dueOn = complaintDueOn(receivedOn);
    expect(await sendComplaintReminders(handle.db, addDays(dueOn, -1))).toBe(1);
    expect((await deliver()).map((m) => [m.to, m.subject])).toEqual([
      ["hello@kummie.eu", "Рекламация RK-0002: остават 1 дни"],
    ]);
    await sendComplaintReminders(handle.db, addDays(dueOn, -1));
    expect(await deliver()).toEqual([]);

    // Refused with the reason; the customer is told where to go next.
    const rk1 = list.find((c) => c.number === "RK-0001");
    const closed = await staff("POST", `/admin-api/complaints/${rk1?.id}/resolve`, {
      status: "rejected",
      outcome: "Повредата е от неправилна употреба.",
    });
    expect((closed.json() as ComplaintList).items.map((c) => c.number)).toEqual(["RK-0002"]);
    const [answer] = await deliver();
    expect(answer?.to).toBe("ivan@kummie.test");
    expect(answer?.text).toContain("Повредата е от неправилна употреба.");
    expect(answer?.text).toContain("kzp.bg");
    expect(
      (
        await staff("POST", `/admin-api/complaints/${rk1?.id}/resolve`, {
          status: "resolved",
          outcome: "Сменихме я.",
        })
      ).statusCode,
    ).toBe(409);

    const all = (await staff("GET", "/admin-api/complaints?status=all")).json() as ComplaintList;
    expect(all.items.find((c) => c.number === "RK-0001")).toMatchObject({ status: "rejected" });
    const csv = await staff("GET", "/admin-api/complaints.csv");
    expect(csv.headers["content-type"]).toContain("text/csv");
    expect(csv.body).toContain("RK-0001;");
    expect(csv.body).toContain(";Отказана;Повредата е от неправилна употреба.;");
    expect(csv.body).toContain(";Телефон;");
  });
});
