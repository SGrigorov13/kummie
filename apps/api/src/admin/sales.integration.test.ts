import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { businessDay } from "@kummie/core";
import type { LoginResponse, SalesReadiness } from "@kummie/contracts";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { EmailAdapter } from "../adapters/email";
import { FakePaymentProvider } from "../adapters/fake-payment";
import type { PaymentProvider } from "../adapters/payment";
import { buildApp } from "../app";
import { createSecretBox } from "../auth/crypto";
import { timeStep, totpCode } from "../auth/totp";
import { createDatabase, type DatabaseHandle } from "../db/client";
import { products, settings, variants } from "../db/schema";
import { seed } from "../db/seed";
import { createStaff } from "./staff-cli";

/** Same safety rule as the other database tests: only databases named *_test, which are wiped. */
const url = process.env.TEST_DATABASE_URL;
const safe = !!url && /\/[^/?]+_test(\?|$)/.test(url);
const WEB = "http://localhost:3000";
const ADMIN = "http://localhost:5173";
const PASSWORD = "staff-test-Passw0rd!";
const ADDRESS = {
  name: "Иван",
  line1: "ул. 1",
  line2: null,
  city: "София",
  postcode: "1000",
  country: "BG",
  phone: "+359 888 123 456",
};

describe.skipIf(!safe)("go-live gate on PostgreSQL", () => {
  let handle: DatabaseHandle;
  let ip = 0;
  let variantId = "";
  const secretBox = createSecretBox(randomBytes(32).toString("base64"));
  const fake = new FakePaymentProvider("http://localhost:3001/fake-pay", "test-secret");
  /** A stand-in for the real bank adapter: same behaviour, a non-test name. */
  const bank: PaymentProvider = {
    name: "testbank",
    createSession: (i) => fake.createSession(i),
    handleWebhook: (i) => fake.handleWebhook(i),
    capture: (p, a) => fake.capture(p, a),
    refund: (i) => fake.refund(i),
    getStatus: (p) => fake.getStatus(p),
  };
  const mail = (name: string): EmailAdapter => ({
    name,
    send: async () => ({ messageId: "1", accepted: true }),
  });

  function appWith(payments: PaymentProvider, emailName: string) {
    const accounts = {
      db: handle.db,
      email: mail(emailName),
      webUrl: WEB,
      allowedOrigins: [WEB],
      cookieSecure: false,
    };
    const shop = { ...accounts, payments, fakePayments: fake };
    return buildApp({
      logger: false,
      checkDb: async () => "ok",
      accounts,
      shop,
      admin: { db: handle.db, secretBox, allowedOrigins: [ADMIN], cookieSecure: false, shop },
    });
  }

  let session = "";
  /** Signs in once (2FA codes cannot be reused within their 30 seconds); the session works for every app. */
  async function signIn(app: ReturnType<typeof buildApp>) {
    if (session) return session;
    const call = (path: string, payload: object) =>
      app.inject({ method: "POST", url: path, payload, headers: { origin: ADMIN } });
    const login = (
      await call("/admin-api/auth/login", { email: "owner@kummie.test", password: PASSWORD })
    ).json() as LoginResponse;
    if (login.step === "enroll") {
      const res = await call("/admin-api/auth/enroll", {
        challenge: login.challenge,
        code: totpCode(login.secret, timeStep()),
      });
      session = String(res.headers["set-cookie"]).split(";")[0] ?? "";
      return session;
    }
    throw new Error("expected enrolment on first sign-in");
  }

  async function checkout(app: ReturnType<typeof buildApp>) {
    const n = ++ip;
    const add = await app.inject({
      method: "PUT",
      url: "/cart/lines",
      remoteAddress: `10.5.0.${n}`,
      payload: { variantId, qty: 1, add: true },
      headers: { origin: WEB },
    });
    const cookie = `kummie_cart=${add.cookies.find((c) => c.name === "kummie_cart")?.value ?? ""}`;
    return app.inject({
      method: "POST",
      url: "/checkout",
      remoteAddress: `10.5.1.${n}`,
      payload: { email: "g@kummie.test", locale: "bg", address: ADDRESS, invoice: null, acceptTerms: true },
      headers: { origin: WEB, cookie },
    });
  }

  beforeAll(async () => {
    handle = createDatabase(url as string, 2);
    await handle.db.execute(sql`drop schema if exists public cascade`);
    await handle.db.execute(sql`drop schema if exists drizzle cascade`);
    await handle.db.execute(sql`create schema public`);
    await migrate(handle.db, { migrationsFolder: resolve(import.meta.dirname, "../../drizzle") });
    await seed(handle.db);
    await createStaff(handle.db, {
      email: "owner@kummie.test",
      name: "Owner",
      role: "admin",
      password: PASSWORD,
    });
    const [row] = await handle.db
      .select({ id: variants.id })
      .from(variants)
      .innerJoin(products, eq(products.id, variants.productId))
      .where(eq(products.status, "published"))
      .limit(1);
    variantId = row?.id ?? "";
  });

  afterAll(async () => {
    await handle?.close();
  });

  it("starts closed for real sales: test payments only, the switch refuses to turn on", async () => {
    const app = appWith(fake, "file");
    const cookie = await signIn(app);
    const get = (
      await app.inject({ method: "GET", url: "/admin-api/sales", headers: { origin: ADMIN, cookie } })
    ).json() as SalesReadiness;
    expect(get).toMatchObject({ enabled: false, mode: "test", canEnable: false });
    expect(get.conditions.filter((c) => !c.ok).map((c) => c.id)).toEqual([
      "company",
      "oss",
      "nap",
      "payment",
      "email",
      "legal",
    ]);

    const on = await app.inject({
      method: "PUT",
      url: "/admin-api/sales",
      payload: { enabled: true },
      headers: { origin: ADMIN, cookie },
    });
    expect(on.statusCode).toBe(409);
    expect((await checkout(app)).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/site/trader" })).json().salesMode).toBe("test");
    await app.close();
  });

  it("refuses checkout with a real provider before go-live, and opens once everything is green", async () => {
    const app = appWith(bank, "smtp");
    const cookie = await signIn(app);
    const headers = { origin: ADMIN, cookie };
    expect((await checkout(app)).json()).toMatchObject({ error: "sales_closed" });

    // A new payment provider is a change to the facts declared to НАП: a 7-day reminder appears.
    let state = (
      await app.inject({ method: "GET", url: "/admin-api/sales", headers })
    ).json() as SalesReadiness;
    const today = businessDay(new Date());
    expect(state.napUpdates).toEqual([
      expect.objectContaining({
        kind: "payment_provider",
        changedOn: today,
        daysLeft: 7,
        note: "fake → testbank",
      }),
    ]);

    await handle.db
      .insert(settings)
      .values({
        key: "company",
        value: {
          legalName: "СГ Корпорейшън ЕООД",
          eik: "123456789",
          vatNumber: "BG123456789",
          registeredAddress: "София",
          contactEmail: "hello@kummie.eu",
          contactPhone: "+359 888 000 000",
          iban: "BG80BNBG96611020345678",
          euResponsiblePerson: "СГ Корпорейшън ЕООД",
          ossEffectiveFrom: "2026-01-01",
          napRfNumber: "RF1",
          napEShopNumber: "RF1",
          napRegisteredOn: "2026-11-01",
        },
      })
      .onConflictDoNothing();
    for (const page of ["terms", "withdrawal", "returns", "guarantee", "privacy", "complaints"]) {
      state = (
        await app.inject({
          method: "PUT",
          url: "/admin-api/sales/legal",
          payload: { page, approved: true },
          headers,
        })
      ).json();
    }
    expect(state.canEnable).toBe(true);
    state = (
      await app.inject({ method: "PUT", url: "/admin-api/sales", payload: { enabled: true }, headers })
    ).json();
    expect(state).toMatchObject({ enabled: true, mode: "live" });
    expect((await checkout(app)).statusCode).toBe(200);

    const reminder = state.napUpdates[0]?.id ?? "";
    state = (
      await app.inject({
        method: "POST",
        url: `/admin-api/sales/nap-updates/${reminder}/submitted`,
        payload: {},
        headers,
      })
    ).json();
    expect(state.napUpdates[0]?.submittedOn).toBe(today);

    // Taking a page back (e.g. new terms under review) closes sales again at once.
    state = (
      await app.inject({
        method: "PUT",
        url: "/admin-api/sales/legal",
        payload: { page: "terms", approved: false },
        headers,
      })
    ).json();
    expect(state).toMatchObject({ enabled: true, mode: "closed" });
    expect((await checkout(app)).json()).toMatchObject({ error: "sales_closed" });
    await app.close();
  });

  it("never sells with test payments once switched on", async () => {
    const app = appWith(fake, "smtp");
    expect((await app.inject({ method: "GET", url: "/site/trader" })).json().salesMode).toBe("closed");
    expect((await checkout(app)).json()).toMatchObject({ error: "sales_closed" });
    await app.close();
  });
});
