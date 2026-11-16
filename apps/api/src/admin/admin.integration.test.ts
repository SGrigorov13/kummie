import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import type { AdminProduct, LoginResponse, ProductInput } from "@kummie/contracts";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../app";
import { createSecretBox } from "../auth/crypto";
import { timeStep, totpCode } from "../auth/totp";
import { createDatabase, type DatabaseHandle } from "../db/client";
import { auditLog, staffUsers } from "../db/schema";
import { seed } from "../db/seed";
import { createStaff } from "./staff-cli";

/** Same safety rule as the catalogue tests: only databases named *_test, which are wiped. */
const url = process.env.TEST_DATABASE_URL;
const safe = !!url && /\/[^/?]+_test(\?|$)/.test(url);

const PASSWORD = "test-only-Passw0rd!";

describe.skipIf(!safe)("staff API on PostgreSQL", () => {
  let handle: DatabaseHandle;
  let app: ReturnType<typeof buildApp>;
  let cookie = "";
  let secret = "";

  beforeAll(async () => {
    handle = createDatabase(url as string, 2);
    await handle.db.execute(sql`drop schema if exists public cascade`);
    await handle.db.execute(sql`drop schema if exists drizzle cascade`);
    await handle.db.execute(sql`create schema public`);
    await migrate(handle.db, { migrationsFolder: resolve(import.meta.dirname, "../../drizzle") });
    await seed(handle.db);
    await createStaff(handle.db, {
      email: "Editor@Kummie.test",
      name: "Editor",
      role: "admin",
      password: PASSWORD,
    });
    app = buildApp({
      logger: false,
      checkDb: async () => "ok",
      admin: {
        db: handle.db,
        secretBox: createSecretBox(randomBytes(32).toString("base64")),
        allowedOrigins: ["http://localhost:5173"],
        cookieSecure: false,
      },
    });
  });

  afterAll(async () => {
    await app?.close();
    await handle?.close();
  });

  const post = (path: string, payload: unknown) =>
    app.inject({ method: "POST", url: path, payload: payload as object, headers: cookie ? { cookie } : {} });

  it("refuses wrong passwords and weak new passwords", async () => {
    const wrong = await post("/admin-api/auth/login", { email: "editor@kummie.test", password: "nope" });
    expect(wrong.statusCode).toBe(401);
    await expect(
      createStaff(handle.db, { email: "x@kummie.test", name: "X", role: "hub", password: "short" }),
    ).rejects.toThrow(/12 characters/);
  });

  it("forces 2FA enrolment on the first sign-in, then issues a session", async () => {
    const login = await post("/admin-api/auth/login", { email: "EDITOR@kummie.test", password: PASSWORD });
    expect(login.statusCode).toBe(200);
    const body = login.json() as LoginResponse;
    expect(body.step).toBe("enroll");
    if (body.step !== "enroll") return;
    secret = body.secret;
    expect(body.otpauthUrl).toContain("otpauth://totp/");

    const wrongCode = await post("/admin-api/auth/enroll", { challenge: body.challenge, code: "000000" });
    expect(wrongCode.statusCode).toBe(401);

    const enrolled = await post("/admin-api/auth/enroll", {
      challenge: body.challenge,
      code: totpCode(secret, timeStep()),
    });
    expect(enrolled.statusCode).toBe(200);
    const setCookie = String(enrolled.headers["set-cookie"]);
    expect(setCookie).toMatch(/kummie_staff=.+HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Strict/i);
    cookie = setCookie.split(";")[0] as string;

    const [row] = await handle.db.select().from(staffUsers).where(eq(staffUsers.email, "editor@kummie.test"));
    expect(row?.totpEnabled).toBe(true);
    expect(row?.totpSecretEnc).not.toContain(secret);
  });

  it("asks for the code on the next sign-in and blocks a reused code", async () => {
    const saved = cookie;
    cookie = "";
    const login = (await post("/admin-api/auth/login", {
      email: "editor@kummie.test",
      password: PASSWORD,
    }).then((r) => r.json())) as LoginResponse;
    expect(login.step).toBe("totp");
    // The enrolment already used the current step, so the same code is refused (no replays).
    const replay = await post("/admin-api/auth/totp", {
      challenge: login.challenge,
      code: totpCode(secret, timeStep()),
    });
    expect(replay.statusCode).toBe(401);
    cookie = saved;
  });

  it("protects staff routes", async () => {
    const anonymous = await app.inject({ method: "GET", url: "/admin-api/me" });
    expect(anonymous.statusCode).toBe(401);
    const me = await app.inject({ method: "GET", url: "/admin-api/me", headers: { cookie } });
    expect(me.json()).toMatchObject({ email: "editor@kummie.test", role: "admin" });
    const form = await app.inject({
      method: "POST",
      url: "/admin-api/products/00000000-0000-0000-0000-000000000000/publish",
      headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
      payload: "a=b",
    });
    expect(form.statusCode).toBe(415);
  });

  it("saves company settings with validation and an audit record", async () => {
    const get = await app.inject({ method: "GET", url: "/admin-api/settings/company", headers: { cookie } });
    expect(get.json()).toMatchObject({ legalName: null, deliveryFeesCents: { BG: 490 } });
    const next = {
      ...(get.json() as object),
      legalName: "СГ Корпорейшън ЕООД",
      eik: "123456789",
      vatNumber: "BG123456789",
      ossEffectiveFrom: "2027-01-01",
    };
    const put = await app.inject({
      method: "PUT",
      url: "/admin-api/settings/company",
      headers: { cookie },
      payload: next,
    });
    expect(put.statusCode).toBe(200);
    const bad = await app.inject({
      method: "PUT",
      url: "/admin-api/settings/company",
      headers: { cookie },
      payload: { ...next, eik: "12" },
    });
    expect(bad.statusCode).toBe(400);
    const rows = await handle.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "settings.company_updated"));
    expect(rows[0]?.data).toMatchObject({ changed: expect.arrayContaining(["legalName", "eik"]) });
  });

  it("creates a draft, blocks publishing until GPSR fields are filled, then publishes", async () => {
    const input: ProductInput = {
      slug: "kum-test-pouch",
      title: "KUMMIE Test Pouch",
      summary: { bg: "Несесер", en: "Pouch" },
      subcategoryId: "pouches",
      groupId: null,
      sourcing: "KUMMIE_ORIGINAL",
      state: null,
      isLimited: false,
      variants: [{ version: "One size", sku: "KUM-TEST-POUCH", priceCents: 1200, active: true }],
      compliance: {
        dispatchEstimate: { bg: "", en: "" },
        deliveryRegions: [],
        manufacturer: "",
        euResponsiblePerson: "",
        safetyInfo: null,
        warnings: [],
        safetyNone: false,
        returnExceptions: [],
        returnExceptionsNone: false,
      },
    };
    const created = await post("/admin-api/products", input);
    expect(created.statusCode).toBe(200);
    const product = created.json() as AdminProduct;
    expect(product.status).toBe("draft");
    expect(product.missing).toEqual([
      "dispatchEstimate",
      "deliveryRegions",
      "manufacturer",
      "euResponsiblePerson",
      "safety",
      "returnExceptions",
    ]);

    const blocked = await post(`/admin-api/products/${product.id}/publish`, {});
    expect(blocked.statusCode).toBe(422);
    expect(blocked.json()).toMatchObject({ error: "publish_blocked" });

    const duplicate = await post("/admin-api/products", {
      ...input,
      variants: [{ ...input.variants[0], sku: "KUM-OTHER" }],
    });
    expect(duplicate.statusCode).toBe(409);

    const complete: ProductInput = {
      ...input,
      variants: [{ ...(input.variants[0] as ProductInput["variants"][number]), id: product.variants[0]?.id }],
      compliance: {
        ...input.compliance,
        dispatchEstimate: { bg: "3–5 дни", en: "3–5 days" },
        deliveryRegions: ["BG", "RO", "GR"],
        manufacturer: "KUMMIE Originals",
        euResponsiblePerson: "СГ Корпорейшън ЕООД",
        safetyNone: true,
        returnExceptionsNone: true,
      },
    };
    const updated = await app.inject({
      method: "PUT",
      url: `/admin-api/products/${product.id}`,
      headers: { cookie },
      payload: complete,
    });
    expect((updated.json() as AdminProduct).missing).toEqual([]);

    const published = await post(`/admin-api/products/${product.id}/publish`, {});
    expect((published.json() as AdminProduct).status).toBe("published");

    // A published product may not be edited back into a non-compliant state.
    const breaking = await app.inject({
      method: "PUT",
      url: `/admin-api/products/${product.id}`,
      headers: { cookie },
      payload: { ...complete, compliance: { ...complete.compliance, manufacturer: "" } },
    });
    expect(breaking.statusCode).toBe(422);

    const actions = (await handle.db.select({ action: auditLog.action }).from(auditLog)).map((r) => r.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        "staff.created",
        "staff.totp_enrolled",
        "product.created",
        "product.updated",
        "product.published",
      ]),
    );
  });

  it("lists products for staff with what is missing", async () => {
    const list = await app.inject({ method: "GET", url: "/admin-api/products?q=pouch", headers: { cookie } });
    expect(list.json()).toMatchObject({
      items: [{ slug: "kum-test-pouch", status: "published", missingCount: 0 }],
    });
  });
});
