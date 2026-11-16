import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { businessDay } from "@kummie/core";
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
import { products, salesDocuments, settings, variants } from "../db/schema";
import { seed } from "../db/seed";
import { processDueJobs } from "../jobs/outbox";

/** Same safety rule as the other database tests: only databases named *_test, which are wiped. */
const url = process.env.TEST_DATABASE_URL;
const safe = !!url && /\/[^/?]+_test(\?|$)/.test(url);

const WEB = "http://localhost:3000";
const ADMIN = "http://localhost:5173";
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

describe.skipIf(!safe)("Н-18 sales documents and reports on PostgreSQL", () => {
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
      remoteAddress: `10.3.${Math.floor(++ip / 250)}.${ip % 250}`,
      ...(payload === undefined ? {} : { payload: payload as object }),
      headers: { origin, ...headers },
    });
  }
  const cookieOf = (res: Awaited<ReturnType<typeof call>>, name: string) => {
    const c = res.cookies.find((x) => x.name === name);
    return c ? `${name}=${c.value}` : "";
  };
  async function deliver() {
    outbox.length = 0;
    await processDueJobs(handle.db, accountJobHandlers(email), { log: { info: () => {}, error: () => {} } });
    return [...outbox];
  }
  async function guestOrder(invoice: unknown = null) {
    const add = await call("PUT", "/cart/lines", { variantId, qty: 2, add: true });
    const cookie = cookieOf(add, "kummie_cart");
    const res = await call(
      "POST",
      "/checkout",
      { email: "doc@kummie.test", locale: "bg", address: ADDRESS, invoice, acceptTerms: true },
      { cookie },
    );
    return res.json() as { orderId: string; orderKey: string; redirectUrl: string; number: string };
  }
  const pay = (redirectUrl: string) => {
    const sessionId = decodeURIComponent(redirectUrl.split("/fake-pay/")[1] ?? "");
    return app.inject({
      method: "POST",
      url: `/fake-pay/${encodeURIComponent(sessionId)}/pay`,
      payload: "x=1",
      headers: { "content-type": "text/plain" },
    });
  };

  beforeAll(async () => {
    handle = createDatabase(url as string, 4);
    await handle.db.execute(sql`drop schema if exists public cascade`);
    await handle.db.execute(sql`drop schema if exists drizzle cascade`);
    await handle.db.execute(sql`create schema public`);
    await migrate(handle.db, { migrationsFolder: resolve(import.meta.dirname, "../../drizzle") });
    await seed(handle.db);
    await handle.db.insert(settings).values({
      key: "company",
      value: {
        legalName: "СГ Корпорейшън ЕООД",
        eik: "123456789",
        vatNumber: "BG123456789",
        registeredAddress: "София, ул. Тест 1",
        contactEmail: "hello@kummie.eu",
        napRfNumber: "RF0001234",
        napEShopNumber: "RF0001234",
      },
    });
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
      email: "acc@kummie.test",
      name: "Acc",
      role: "admin",
      password: STAFF_PASSWORD,
    });
    const login = (
      await call(
        "POST",
        "/admin-api/auth/login",
        { email: "acc@kummie.test", password: STAFF_PASSWORD },
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

  it("issues the чл. 52о document and the requested invoice on payment, attached as PDF", async () => {
    const order = await guestOrder({
      kind: "company",
      name: "Тест ЕООД",
      eik: "987654321",
      vatNumber: null,
      address: "Пловдив",
    });
    await pay(order.redirectUrl);
    const detail = (
      await call("GET", `/orders/${order.orderId}`, undefined, { "x-order-key": order.orderKey })
    ).json();
    expect(detail.documents.map((d: { kind: string; number: string }) => [d.kind, d.number])).toEqual([
      ["receipt", "0000000001"],
      ["invoice", "0000000001"],
    ]);
    const [receipt] = await handle.db.select().from(salesDocuments).where(eq(salesDocuments.kind, "receipt"));
    expect(receipt?.snapshot.qr).toMatch(
      new RegExp(
        `^RF0001234\\*${businessDay(new Date())}\\*\\d{2}:\\d{2}:\\d{2}\\*FAKEPOS1\\*\\d{6}\\*\\d+\\.\\d{2}\\*${order.number}$`,
      ),
    );
    expect(receipt?.snapshot.seller).toMatchObject({
      legalName: "СГ Корпорейшън ЕООД",
      vatNumber: "BG123456789",
    });

    const pdf = await call("GET", `/orders/${order.orderId}/documents/${detail.documents[0].id}`, undefined, {
      "x-order-key": order.orderKey,
    });
    expect(pdf.headers["content-type"]).toBe("application/pdf");
    expect(pdf.rawPayload.subarray(0, 5).toString()).toBe("%PDF-");
    expect(
      (await call("GET", `/orders/${order.orderId}/documents/${detail.documents[0].id}`)).statusCode,
    ).toBe(404);

    const [mail] = await deliver();
    expect(mail?.attachments?.map((a) => a.filename)).toEqual([
      "kummie-dokument-0000000001.pdf",
      "kummie-faktura-0000000001.pdf",
    ]);
  });

  it("numbers documents without gaps, also for payments at the same moment", async () => {
    const orders = await Promise.all([guestOrder(), guestOrder(), guestOrder()]);
    await Promise.all(orders.map((o) => pay(o.redirectUrl)));
    const numbers = (
      await handle.db
        .select({ n: salesDocuments.number })
        .from(salesDocuments)
        .where(eq(salesDocuments.series, "receipt"))
    )
      .map((r) => r.n)
      .toSorted((a, b) => a - b);
    expect(numbers).toEqual([1, 2, 3, 4]);
  });

  it("issues a storno and a credit note with negative amounts on refund", async () => {
    const order = await guestOrder({ kind: "person", name: "Иван Иванов", address: "София" });
    await pay(order.redirectUrl);
    await deliver();
    await call("POST", `/orders/${order.orderId}/cancel`, {}, { "x-order-key": order.orderKey });
    const docs = await handle.db
      .select()
      .from(salesDocuments)
      .where(eq(salesDocuments.orderId, order.orderId));
    const storno = docs.find((d) => d.kind === "receipt_storno");
    const credit = docs.find((d) => d.kind === "credit_note");
    const receipt = docs.find((d) => d.kind === "receipt");
    expect(storno).toMatchObject({
      number: 6,
      totalCents: -(receipt?.totalCents ?? 0),
      refersToId: receipt?.id,
    });
    expect(storno?.snapshot.refersToNumber).toBe("0000000005");
    expect(credit).toMatchObject({ series: "invoice", number: 3 });
    const mails = await deliver();
    expect(mails[0]?.attachments?.map((a) => a.filename)).toEqual([
      "kummie-storno-0000000006.pdf",
      "kummie-kreditno-izvestie-0000000003.pdf",
    ]);
  });

  it("builds the monthly НАП file and the accountant exports", async () => {
    const today = businessDay(new Date());
    const [year, month] = today.split("-").map(Number) as [number, number];
    const res = await call(
      "GET",
      `/admin-api/reports/nap-audit?year=${year}&month=${month}`,
      undefined,
      { cookie: staffCookie },
      ADMIN,
    );
    expect(res.headers["content-type"]).toContain("windows-1251");
    const xml = new TextDecoder("windows-1251").decode(res.rawPayload);
    expect(xml).toContain(
      "<eik>123456789</eik>\n<e_shop_n>RF0001234</e_shop_n>\n<domain_name>localhost:3000</domain_name>",
    );
    expect(xml.match(/<orderenum>/g)).toHaveLength(5);
    expect(xml).toContain("<doc_n>0000000001</doc_n>");
    expect(xml).toContain("<r_ord>1</r_ord>");
    expect(xml).toContain("<paym>2</paym>\n<pos_n>FAKEPOS1</pos_n>");

    const sales = await call(
      "GET",
      `/admin-api/reports/sales?year=${year}&month=${month}`,
      undefined,
      { cookie: staffCookie },
      ADMIN,
    );
    expect(sales.body).toContain("Сторно чл. 52о;0000000006;0000000005");
    expect(sales.body).toContain("Кредитно известие;0000000003");
    const oss = await call(
      "GET",
      `/admin-api/reports/oss?year=${year}&quarter=${Math.ceil(month / 3)}`,
      undefined,
      { cookie: staffCookie },
      ADMIN,
    );
    expect(oss.body.split("\r\n")[0]).toContain("Държава;Ставка %");

    expect((await call("GET", `/admin-api/reports/nap-audit?year=${year}&month=${month}`)).statusCode).toBe(
      401,
    );
  });
});
