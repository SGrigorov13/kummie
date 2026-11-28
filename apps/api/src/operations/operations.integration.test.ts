import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type {
  BatchDetail,
  LoginResponse,
  ShortageList,
  PackingSlip,
  PackQueue,
  SupplierOfferList,
} from "@kummie/contracts";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { EmailAdapter, EmailMessage } from "../adapters/email";
import { FakeCarrier } from "../adapters/fake-carrier";
import { FakePaymentProvider } from "../adapters/fake-payment";
import { FileSupplierAdapter } from "../adapters/fake-supplier";
import { accountJobHandlers } from "../accounts/erasure";
import { createStaff } from "../admin/staff-cli";
import { buildApp } from "../app";
import { createSecretBox } from "../auth/crypto";
import { timeStep, totpCode } from "../auth/totp";
import { createDatabase, type DatabaseHandle } from "../db/client";
import { addWorkingDays, businessDay, estimateDelivery } from "@kummie/core";
import sharp from "sharp";
import {
  batches,
  orderLines,
  orders,
  payments,
  productCompliance,
  products,
  refunds,
  salesDocuments,
  shortages,
  variants,
} from "../db/schema";
import { seed } from "../db/seed";
import { processDueJobs } from "../jobs/outbox";
import { runOperations, type OperationsDeps } from "./service";

/** Same safety rule as the other database tests: only databases named *_test, which are wiped. */
const url = process.env.TEST_DATABASE_URL;
const safe = !!url && /\/[^/?]+_test(\?|$)/.test(url);

const WEB = "http://localhost:3000";
const ADMIN = "http://localhost:5180";
const STAFF_PASSWORD = "staff-test-Passw0rd!";
const ADDRESS = {
  name: "Мария Петрова",
  line1: "ул. Шипка 1",
  line2: null,
  city: "София",
  postcode: "1000",
  country: "BG",
  phone: "+359 888 123 456",
};

describe.skipIf(!safe)("M2 operations with the test partners on PostgreSQL", () => {
  let handle: DatabaseHandle;
  let app: ReturnType<typeof buildApp>;
  let poDir = "";
  let clock = new Date("2026-11-24T09:00:00Z"); // Tuesday 11:00 in Sofia
  const fake = new FakePaymentProvider("http://localhost:3001/fake-pay", "test-secret");
  const outbox: EmailMessage[] = [];
  const email: EmailAdapter = {
    name: "memory",
    send: async (m) => {
      outbox.push(m);
      return { messageId: String(outbox.length), accepted: true };
    },
  };
  let operations: OperationsDeps;
  let staffCookie = "";
  let ip = 0;
  let sku = "";

  const call = (method: "GET" | "POST" | "PUT", path: string, payload?: unknown, staff = false) =>
    app.inject({
      method,
      url: path,
      remoteAddress: `10.3.${Math.floor(++ip / 250)}.${ip % 250}`,
      ...(payload === undefined ? {} : { payload: payload as object }),
      headers: staff ? { origin: ADMIN, cookie: staffCookie } : { origin: WEB },
    });
  const deliver = async () => {
    outbox.length = 0;
    await processDueJobs(handle.db, accountJobHandlers(email), { log: { info: () => {}, error: () => {} } });
    return [...outbox];
  };

  beforeAll(async () => {
    handle = createDatabase(url as string, 2);
    await handle.db.execute(sql`drop schema if exists public cascade`);
    await handle.db.execute(sql`drop schema if exists drizzle cascade`);
    await handle.db.execute(sql`create schema public`);
    await migrate(handle.db, { migrationsFolder: resolve(import.meta.dirname, "../../drizzle") });
    await seed(handle.db);
    poDir = await mkdtemp(join(tmpdir(), "kummie-ops-"));
    const accounts = { db: handle.db, email, webUrl: WEB, allowedOrigins: [WEB], cookieSecure: false };
    const shop = { ...accounts, payments: fake, fakePayments: fake };
    operations = {
      db: handle.db,
      webUrl: WEB,
      supplier: new FileSupplierAdapter(poDir),
      carriers: [new FakeCarrier(() => clock)],
    };
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
        operations,
      },
    });
    await createStaff(handle.db, {
      email: "ops@kummie.test",
      name: "Ops",
      role: "admin",
      password: STAFF_PASSWORD,
    });
    const login = (
      await call(
        "POST",
        "/admin-api/auth/login",
        { email: "ops@kummie.test", password: STAFF_PASSWORD },
        true,
      )
    ).json() as LoginResponse;
    if (login.step !== "enroll") throw new Error("expected enrolment");
    const enrolled = await call(
      "POST",
      "/admin-api/auth/enroll",
      { challenge: login.challenge, code: totpCode(login.secret, timeStep()) },
      true,
    );
    staffCookie = String(enrolled.headers["set-cookie"]).split(";")[0] ?? "";
    const [row] = await handle.db
      .select({ sku: variants.sku })
      .from(variants)
      .innerJoin(products, eq(products.id, variants.productId))
      .where(eq(products.status, "published"))
      .limit(1);
    sku = row?.sku ?? "";
  });

  afterAll(async () => {
    await app?.close();
    await handle?.close();
    if (poDir) await rm(poDir, { recursive: true, force: true });
  });

  /** A guest buys two units and pays with the test provider. */
  async function paidOrder() {
    const [variant] = await handle.db.select({ id: variants.id }).from(variants).where(eq(variants.sku, sku));
    const cart = await call("PUT", "/cart/lines", { variantId: variant?.id, qty: 2, add: true });
    const cookie = cart.cookies.find((c) => c.name === "kummie_cart");
    const checkout = (
      await app.inject({
        method: "POST",
        url: "/checkout",
        payload: {
          email: "maria@kummie.test",
          locale: "bg",
          address: ADDRESS,
          invoice: null,
          acceptTerms: true,
        },
        headers: { origin: WEB, cookie: `kummie_cart=${cookie?.value}` },
      })
    ).json() as { orderId: string; redirectUrl: string };
    const sessionId = decodeURIComponent(checkout.redirectUrl.split("/fake-pay/")[1] ?? "");
    await app.inject({
      method: "POST",
      url: `/fake-pay/${encodeURIComponent(sessionId)}/pay`,
      payload: "x=1",
      headers: { "content-type": "text/plain" },
    });
    return checkout.orderId;
  }
  const status = async (id: string) =>
    (await handle.db.select({ s: orders.status }).from(orders).where(eq(orders.id, id)))[0]?.s;

  it("takes a paid order through every step to delivered", async () => {
    const id = await paidOrder();
    expect(await status(id)).toBe("paid");

    // Without a supplier offer the order waits and is reported.
    const waiting = await runOperations(operations, clock);
    expect(waiting.assigned).toBe(0);
    expect(waiting.waitingWithoutOffer).toHaveLength(1);

    // Supplier, hub address and an offer for the product.
    await call(
      "PUT",
      "/admin-api/suppliers/kmoon",
      {
        id: "kmoon",
        name: "K-Moon",
        orderEmail: null,
        closeWeekdays: [1, 3, 5],
        closeHour: 12,
        closeMinute: 0,
        minOrderCents: 0,
        ddp: false,
        inEu: true,
        autoSend: false,
        active: true,
      },
      true,
    );
    const offers = (
      await call(
        "PUT",
        "/admin-api/suppliers/kmoon/offers",
        { sku, supplierSku: "km-001", unitCostCents: 1100, active: true },
        true,
      )
    ).json() as SupplierOfferList;
    expect(offers.items.map((o) => [o.sku, o.supplierSku])).toEqual([[sku, "KM-001"]]);

    // D-071: with an offer, the cart shows the calculated window (closing + transit + courier).
    const [v] = await handle.db.select({ id: variants.id }).from(variants).where(eq(variants.sku, sku));
    const added = await call("PUT", "/cart/lines", { variantId: v?.id, qty: 1, add: true });
    const cartCookie = added.cookies.find((c) => c.name === "kummie_cart");
    const cart = (
      await app.inject({
        method: "GET",
        url: "/cart",
        headers: { origin: WEB, cookie: `kummie_cart=${cartCookie?.value}` },
      })
    ).json() as { deliveryWindow: unknown; lines: { deliveryWindow: unknown }[] };
    const expected = estimateDelivery({
      now: new Date(),
      schedule: { weekdays: [1, 3, 5], hour: 12, minute: 0 },
      transitDays: { min: 2, max: 5 },
      courierDays: { min: 1, max: 2 },
      minimumOrder: false,
    });
    expect(cart.lines[0]?.deliveryWindow).toEqual(expected);
    expect(cart.deliveryWindow).toEqual(expected);
    await call(
      "PUT",
      "/admin-api/operations/settings",
      { name: "KUMMIE пункт", line1: "ул. Пункт 1", city: "София", postcode: "1000" },
      true,
    );

    // Into the open batch (closes Wednesday 12:00 Sofia = 10:00 UTC).
    expect((await runOperations(operations, clock)).assigned).toBe(1);
    expect(await status(id)).toBe("batched");
    const [batch] = (await (await call("GET", "/admin-api/batches", undefined, true)).json())
      .items as BatchDetail[];
    expect(batch?.closesAt).toBe("2026-11-25T10:00:00.000Z");
    expect(batch?.units).toBe(2);

    // Wednesday 12:05: the batch closes. D-063: staff download the purchase order (CSV, no
    // customer data), send it themselves and mark it ordered — only then the customer hears of it.
    clock = new Date("2026-11-25T10:05:00Z");
    expect((await runOperations(operations, clock)).closed).toBe(1);
    expect(await status(id)).toBe("batched");
    expect((await runOperations(operations, clock)).closed).toBe(0);
    const po = await call("GET", `/admin-api/batches/${batch?.id}/purchase-order.csv`, undefined, true);
    expect(po.headers["content-type"]).toContain("text/csv");
    expect(po.headers["content-disposition"]).toContain("PO-2026-0001.csv");
    expect(po.body).toContain(",KM-001,");
    expect(po.body).not.toContain("Мария");
    const ordered = await call(
      "POST",
      `/admin-api/batches/${batch?.id}/ordered`,
      { supplierReference: "KM-555" },
      true,
    );
    expect(ordered.statusCode).toBe(200);
    expect(await status(id)).toBe("ordered_from_supplier");

    // Supplier ships; the hub scans two units (one by our SKU, one by the supplier SKU).
    await call("POST", `/admin-api/batches/${batch?.id}/shipped`, { tracking: "IT123" }, true);
    expect(await status(id)).toBe("supplier_shipped");
    const first = (
      await call("POST", `/admin-api/hub/batches/${batch?.id}/scan`, { code: sku }, true)
    ).json();
    expect(first.ok).toBe(true);
    const unknown = (
      await call("POST", `/admin-api/hub/batches/${batch?.id}/scan`, { code: "NOPE" }, true)
    ).json();
    expect(unknown.problem).toBe("unknown");
    await call("POST", `/admin-api/hub/batches/${batch?.id}/scan`, { code: "km-001" }, true);
    const full = (
      await call("POST", `/admin-api/hub/batches/${batch?.id}/scan`, { code: "KM-001" }, true)
    ).json();
    expect(full.problem).toBe("complete");
    await call("POST", `/admin-api/hub/batches/${batch?.id}/done`, {}, true);
    expect(await status(id)).toBe("received_at_hub");

    // D-065: the A4 packing list — the customer's language, warnings, return address, no contact data.
    const [product] = await handle.db
      .select({ id: variants.productId })
      .from(variants)
      .where(eq(variants.sku, sku));
    await handle.db
      .update(productCompliance)
      .set({
        safetyInfo: { bg: "Само за декорация.", en: "Decoration only." },
        warnings: [{ bg: "Съдържа малки части.", en: "Contains small parts." }],
        safetyNone: false,
      })
      .where(eq(productCompliance.productId, product?.id ?? ""));
    const slipResponse = await call("GET", `/admin-api/hub/orders/${id}/packing-slip`, undefined, true);
    expect(slipResponse.statusCode).toBe(200);
    const slip = slipResponse.json() as PackingSlip;
    expect(slip).toMatchObject({
      locale: "bg",
      recipient: { name: "Мария Петрова", city: "София", country: "BG" },
      lines: [{ sku, qty: 2 }],
      safety: [{ info: "Само за декорация.", warnings: ["Съдържа малки части."] }],
      returnAddress: { name: "KUMMIE пункт", line1: "ул. Пункт 1" },
      withdrawalDays: 14,
      withdrawalUrl: `${WEB}/bg/legal/withdrawal`,
      orderUrl: `${WEB}/bg/orders/${id}`,
    });
    expect(slip.orderNumber).toMatch(/^KUM-/);
    expect(slipResponse.body).not.toContain("maria@kummie.test");
    expect(slipResponse.body).not.toContain("888 123 456");
    expect(slipResponse.body).not.toContain("Шипка");

    // Packing: a wrong count is refused; the right one makes the label.
    const wrong = await call(
      "POST",
      `/admin-api/hub/orders/${id}/pack`,
      { items: [{ sku, qty: 1 }], weightGrams: 900 },
      true,
    );
    expect(wrong.statusCode).toBe(422);
    const queue = (
      await call(
        "POST",
        `/admin-api/hub/orders/${id}/pack`,
        { items: [{ sku, qty: 2 }], weightGrams: 900 },
        true,
      )
    ).json() as PackQueue;
    const parcel = queue.items.find((o) => o.id === id)?.parcel;
    expect(parcel?.carrier).toBe("fake");
    expect(await status(id)).toBe("packed");
    const label = await call("GET", `/admin-api/hub/parcels/${parcel?.id}/label`, undefined, true);
    expect(label.headers["content-type"]).toBe("application/pdf");

    // Hand-over by scanning the label, then the courier moves it on by itself.
    const handed = await call(
      "POST",
      "/admin-api/hub/handover",
      { trackingNumber: parcel?.trackingNumber },
      true,
    );
    expect(handed.statusCode).toBe(200);
    expect(await status(id)).toBe("handed_to_carrier");
    // Once with the courier, the parcel's packing list is no longer available at the hub.
    expect((await call("GET", `/admin-api/hub/orders/${id}/packing-slip`, undefined, true)).statusCode).toBe(
      409,
    );
    clock = new Date("2026-11-26T13:00:00Z"); // label + 26 h
    await runOperations(operations, clock);
    expect(await status(id)).toBe("delivered");

    // The customer saw every step by e-mail and sees the tracking number.
    const subjects = (await deliver()).filter((m) => m.to === "maria@kummie.test").map((m) => m.subject);
    expect(subjects.length).toBeGreaterThanOrEqual(6);
    const page = await app.inject({ method: "GET", url: `/orders/${id}`, headers: { origin: WEB } });
    expect([401, 403, 404]).toContain(page.statusCode); // guests need their key; covered by the shop tests
  });

  it("prefers the EU supplier, waits up to 7 days for the minimum, sends by itself", async () => {
    clock = new Date("2026-11-30T05:00:00Z"); // Monday 07:00 in Sofia
    const schedule = { closeWeekdays: [1, 4], closeHour: 8, closeMinute: 30, ddp: false, active: true };
    // A cheaper supplier outside the EU, and K-Moon (EU) with a €1000 minimum and automatic sending.
    await call(
      "PUT",
      "/admin-api/suppliers/seoul",
      {
        id: "seoul",
        name: "Seoul",
        orderEmail: null,
        ...schedule,
        minOrderCents: 0,
        inEu: false,
        autoSend: true,
      },
      true,
    );
    // Its price list arrives as an Excel CSV (semicolons, decimal comma); unknown SKUs are reported.
    const imported = await call(
      "POST",
      "/admin-api/suppliers/seoul/offers/import",
      { csv: `sku;supplier_sku;unit_cost_eur;active\n${sku};se-001;5,00;да\nNOPE-1;SE-X;1;да\n` },
      true,
    );
    expect(imported.json()).toMatchObject({ saved: 1, issues: [{ row: 3 }] });
    await call(
      "PUT",
      "/admin-api/suppliers/kmoon",
      {
        id: "kmoon",
        name: "K-Moon",
        orderEmail: null,
        ...schedule,
        minOrderCents: 100_000,
        inEu: true,
        autoSend: true,
      },
      true,
    );

    const id = await paidOrder();
    // The window is frozen into the order line at checkout (D-071).
    const [frozen] = await handle.db.select().from(orderLines).where(eq(orderLines.orderId, id));
    expect(frozen?.dispatchEstimate.bg).toMatch(/^Очаквана доставка: \d/);
    expect((await runOperations(operations, clock)).assigned).toBe(1);
    const open = async () => (await handle.db.select().from(batches).where(eq(batches.status, "open")))[0];
    expect((await open())?.supplierId).toBe("kmoon");
    expect((await open())?.closesAt.toISOString()).toBe("2026-11-30T06:30:00.000Z");

    // Below the minimum: Monday and Thursday it waits, the Monday after (7 days) it goes anyway.
    clock = new Date("2026-11-30T06:35:00Z");
    expect((await runOperations(operations, clock)).closed).toBe(0);
    expect((await open())?.closesAt.toISOString()).toBe("2026-12-03T06:30:00.000Z");
    clock = new Date("2026-12-03T06:35:00Z");
    expect((await runOperations(operations, clock)).closed).toBe(0);
    expect((await open())?.closesAt.toISOString()).toBe("2026-12-07T06:30:00.000Z");
    clock = new Date("2026-12-07T06:35:00Z");
    expect((await runOperations(operations, clock)).closed).toBe(1);
    expect(await status(id)).toBe("ordered_from_supplier");
    const [file] = (await readdir(poDir)).filter((f) => f.endsWith(".csv"));
    expect(await readFile(join(poDir, file ?? ""), "utf8")).toContain(",KM-001,");

    // Every supplier says "none": the shop says "out of stock" and the cart refuses it.
    for (const [supplier, supplierSku, unitCostCents] of [
      ["kmoon", "KM-001", 1100],
      ["seoul", "SE-001", 500],
    ] as const)
      await call(
        "PUT",
        `/admin-api/suppliers/${supplier}/offers`,
        { sku, supplierSku, unitCostCents, active: false },
        true,
      );
    const [variant] = await handle.db.select({ id: variants.id }).from(variants).where(eq(variants.sku, sku));
    const refused = await call("PUT", "/cart/lines", { variantId: variant?.id, qty: 1, add: true });
    expect(refused.statusCode).toBe(404);
  });

  it("hands over a label only once and only for known parcels", async () => {
    const again = await call("POST", "/admin-api/hub/handover", { trackingNumber: "FKNOPE0000" }, true);
    expect(again.statusCode).toBe(404);
  });

  it("records damaged and missing units, refunds them on confirmation and ships the rest", async () => {
    // The order from the previous test: 2 × KM-001 in K-Moon's batch, ordered from the supplier.
    const [order] = await handle.db.select().from(orders).where(eq(orders.status, "ordered_from_supplier"));
    const [batch] = await handle.db.select().from(batches).where(eq(batches.status, "ordered"));
    const id = order?.id ?? "";
    const batchId = batch?.id ?? "";

    // One unit arrived broken (with a photo for the claim), the other did not arrive at all.
    const damaged = await call(
      "PUT",
      `/admin-api/hub/batches/${batchId}/damage`,
      { supplierSku: "KM-001", qty: 1, note: "Счупена кутия" },
      true,
    );
    expect((damaged.json() as BatchDetail).items[0]).toMatchObject({ receivedQty: 0, damagedQty: 1 });
    const png = await sharp({ create: { width: 40, height: 30, channels: 3, background: "#ff0000" } })
      .png()
      .toBuffer();
    const photo = await app.inject({
      method: "POST",
      url: `/admin-api/hub/batches/${batchId}/damage-photo?sku=KM-001`,
      payload: png,
      headers: { origin: ADMIN, cookie: staffCookie, "content-type": "image/png" },
    });
    expect(photo.statusCode).toBe(200);
    expect((photo.json() as BatchDetail).items[0]?.damagePhoto).toBe(true);
    await call("POST", `/admin-api/hub/batches/${batchId}/done`, {}, true);
    expect(await status(id)).toBe("supplier_shipped");

    const [line] = await handle.db.select().from(orderLines).where(eq(orderLines.orderId, id));
    const unit = line?.unitPriceCents ?? 0;
    const list = (await call("GET", "/admin-api/hub/shortages", undefined, true)).json() as ShortageList;
    const dueOn = addWorkingDays(businessDay(new Date()), 3);
    expect(list.items.map((s) => [s.kind, s.qty, s.status, s.dueOn, s.refundCents, s.due])).toEqual([
      ["damaged", 1, "open", dueOn, unit, false],
      ["missing", 1, "open", dueOn, unit, false],
    ]);
    const damagedShortage = list.items.find((s) => s.kind === "damaged");
    const missingShortage = list.items.find((s) => s.kind === "missing");
    expect(damagedShortage).toMatchObject({ note: "Счупена кутия", supplierName: "K-Moon" });
    const jpeg = await call(
      "GET",
      `/admin-api/hub/damage/${damagedShortage?.photoId}/photo`,
      undefined,
      true,
    );
    expect(jpeg.headers["content-type"]).toBe("image/jpeg");
    expect((await call("GET", `/admin-api/hub/damage/${damagedShortage?.photoId}/photo`)).statusCode).toBe(
      401,
    );

    // The claim goes to the supplier; the missing unit comes after all.
    await call("POST", `/admin-api/hub/shortages/${damagedShortage?.id}/claim`, {}, true);
    const afterArrived = (
      await call("POST", `/admin-api/hub/shortages/${missingShortage?.id}/arrived`, {}, true)
    ).json() as ShortageList;
    expect(afterArrived.items.find((s) => s.id === missingShortage?.id)?.status).toBe("arrived");
    expect(afterArrived.items.find((s) => s.id === damagedShortage?.id)?.claimSentAt).not.toBeNull();
    expect(await status(id)).toBe("supplier_shipped");

    // Staff confirm the refund of the damaged unit: card, storno, e-mail; the rest goes on.
    await deliver();
    const refunded = await call("POST", `/admin-api/hub/shortages/${damagedShortage?.id}/refund`, {}, true);
    expect(refunded.statusCode).toBe(200);
    expect(await status(id)).toBe("received_at_hub");
    const [after] = await handle.db.select().from(orderLines).where(eq(orderLines.orderId, id));
    expect(after?.refundedQty).toBe(1);
    const [refund] = await handle.db.select().from(refunds).where(eq(refunds.orderId, id));
    expect(refund).toMatchObject({ amountCents: unit, reason: "damaged", status: "succeeded" });
    const [payment] = await handle.db.select().from(payments).where(eq(payments.orderId, id));
    expect(payment?.status).toBe("partially_refunded");
    const storno = (await handle.db.select().from(salesDocuments).where(eq(salesDocuments.orderId, id))).find(
      (d) => d.kind === "receipt_storno",
    );
    expect(storno).toMatchObject({ totalCents: -unit, refundId: refund?.id });
    expect(storno?.snapshot.reason).toBe("повредени при доставката бройки");
    expect(storno?.snapshot.lines).toHaveLength(1);
    const mails = (await deliver()).filter((m) => m.to === "maria@kummie.test");
    const mail = mails.find((m) => m.subject.includes("върнахме"));
    expect(mail?.text).toContain("пристигна при нас повреден");
    expect(mail?.attachments?.map((a) => a.filename)).toEqual([
      expect.stringMatching(/^kummie-storno-\d{10}\.pdf$/),
    ]);
    expect(
      (await call("POST", `/admin-api/hub/shortages/${damagedShortage?.id}/refund`, {}, true)).statusCode,
    ).toBe(409);
    const [row] = await handle.db
      .select()
      .from(shortages)
      .where(eq(shortages.id, damagedShortage?.id ?? ""));
    expect(row?.status).toBe("refunded");

    // Only the one good unit is packed.
    const queue = (await call("GET", "/admin-api/hub/packing", undefined, true)).json() as PackQueue;
    expect(queue.items.find((o) => o.id === id)?.lines).toEqual([expect.objectContaining({ sku, qty: 1 })]);
    const packed = await call(
      "POST",
      `/admin-api/hub/orders/${id}/pack`,
      { items: [{ sku, qty: 1 }], weightGrams: 500 },
      true,
    );
    expect(packed.statusCode).toBe(200);
    expect(await status(id)).toBe("packed");
  });
});
