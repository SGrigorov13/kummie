import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import type { LoginResponse, ProductImportReport } from "@kummie/contracts";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../app";
import { createSecretBox } from "../auth/crypto";
import { timeStep, totpCode } from "../auth/totp";
import { IMPORT_COLUMNS } from "../catalogue/import";
import { createDatabase, type DatabaseHandle } from "../db/client";
import { products, supplierOffers, suppliers, variants } from "../db/schema";
import { seed } from "../db/seed";
import { createStaff } from "./staff-cli";

/** Same safety rule as the other database tests: only databases named *_test, which are wiped. */
const url = process.env.TEST_DATABASE_URL;
const safe = !!url && /\/[^/?]+_test(\?|$)/.test(url);
const ADMIN = "http://localhost:5180";
const PASSWORD = "staff-test-Passw0rd!";

const header = IMPORT_COLUMNS.map((c) => c.key).join(";");
const row = (values: Record<string, string>) => IMPORT_COLUMNS.map((c) => values[c.key] ?? "").join(";");
const complete = {
  title: "Imported Pouch",
  subcategory: "pouches",
  sourcing: "KUMMIE_ORIGINAL",
  dispatch_bg: "3–5 работни дни",
  dispatch_en: "3–5 working days",
  manufacturer: "Пример ООД, София",
  eu_responsible: "KUMMIE EU",
  safety_none: "1",
  returns_none: "1",
};

describe.skipIf(!safe)("product import on PostgreSQL", () => {
  let handle: DatabaseHandle;
  let app: ReturnType<typeof buildApp>;
  let cookie = "";

  const call = (method: "GET" | "POST", path: string, payload?: unknown) =>
    app.inject({
      method,
      url: path,
      ...(payload === undefined ? {} : { payload: payload as object }),
      headers: { origin: ADMIN, cookie },
    });
  const importCsv = async (csv: string, dryRun: boolean) =>
    (await call("POST", "/admin-api/products/import", { csv, dryRun })).json() as ProductImportReport;

  beforeAll(async () => {
    handle = createDatabase(url as string, 2);
    await handle.db.execute(sql`drop schema if exists public cascade`);
    await handle.db.execute(sql`drop schema if exists drizzle cascade`);
    await handle.db.execute(sql`create schema public`);
    await migrate(handle.db, { migrationsFolder: resolve(import.meta.dirname, "../../drizzle") });
    await seed(handle.db);
    app = buildApp({
      logger: false,
      checkDb: async () => "ok",
      admin: {
        db: handle.db,
        secretBox: createSecretBox(randomBytes(32).toString("base64")),
        allowedOrigins: [ADMIN],
        cookieSecure: false,
      },
    });
    await createStaff(handle.db, {
      email: "cat@kummie.test",
      name: "Cat",
      role: "content",
      password: PASSWORD,
    });
    const login = (
      await call("POST", "/admin-api/auth/login", { email: "cat@kummie.test", password: PASSWORD })
    ).json() as LoginResponse;
    if (login.step !== "enroll") throw new Error("expected enrolment");
    const enrolled = await call("POST", "/admin-api/auth/enroll", {
      challenge: login.challenge,
      code: totpCode(login.secret, timeStep()),
    });
    cookie = String(enrolled.headers["set-cookie"]).split(";")[0] ?? "";
  });

  afterAll(async () => {
    await app?.close();
    await handle?.close();
  });

  it("serves the template with the required columns and the codes from the database", async () => {
    const res = await call("GET", "/admin-api/products/import-template");
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.body.split("\r\n")[0]).toBe(`﻿${header}`);
    expect(res.body).toContain("#ЗАДЪЛЖИТЕЛНО");
    expect(res.body).toContain("pouches = ");
  });

  it("checks the file without writing, then imports: complete products published, others drafts", async () => {
    const csv = [
      header,
      row({
        ...complete,
        slug: "imp-pouch",
        version: "Pink",
        sku: "IMP-POUCH-P",
        price_eur: "12,90",
        publish: "1",
      }),
      row({ slug: "imp-pouch", version: "Blue", sku: "IMP-POUCH-B", price_eur: "13,90" }),
      row({
        slug: "imp-draft",
        title: "Draft thing",
        subcategory: "pouches",
        sourcing: "KUMMIE_ORIGINAL",
        version: "One",
        sku: "IMP-DRAFT",
        price_eur: "5",
        publish: "1",
      }),
    ].join("\r\n");

    const check = await importCsv(csv, true);
    expect(check.applied).toBe(false);
    expect(check.issues).toEqual([]);
    expect(check.products.map((p) => [p.slug, p.action, p.variants, p.missing.length === 0])).toEqual([
      ["imp-pouch", "create", 2, true],
      ["imp-draft", "create", 1, false],
    ]);
    expect(await handle.db.select().from(products).where(eq(products.slug, "imp-pouch"))).toHaveLength(0);

    // D-063: no supplier offer yet, so the complete product stays a draft and says why.
    const done = await importCsv(csv, false);
    expect(done.applied).toBe(true);
    expect(done.products.map((p) => [p.slug, p.status, p.missing.includes("supplierOffer")])).toEqual([
      ["imp-pouch", "draft", true],
      ["imp-draft", "draft", true],
    ]);
    expect(done.products[0]?.missing).toEqual(["supplierOffer"]);

    // Offers for both versions (the price-list import itself is covered by the operations test).
    await handle.db.insert(suppliers).values({ id: "kmoon", name: "K-Moon" });
    const pouch = await handle.db
      .select()
      .from(variants)
      .where(sql`${variants.sku} like 'IMP-POUCH-%'`);
    await handle.db.insert(supplierOffers).values(
      pouch.map((v) => ({
        variantId: v.id,
        supplierId: "kmoon",
        supplierSku: `KM-${v.sku}`,
        unitCostCents: 600,
      })),
    );
    const again = await importCsv(csv, false);
    expect(again.products.map((p) => [p.slug, p.status])).toEqual([
      ["imp-pouch", "published"],
      ["imp-draft", "draft"],
    ]);
    const [live] = await handle.db.select().from(products).where(eq(products.slug, "imp-pouch"));
    expect(live?.status).toBe("published");
  });

  it("updates on re-import and keeps the variant ids (orders keep pointing at them)", async () => {
    const [before] = await handle.db
      .select({ id: variants.id })
      .from(variants)
      .where(eq(variants.sku, "IMP-POUCH-P"));
    const csv = [
      header,
      row({ ...complete, slug: "imp-pouch", version: "Pink", sku: "IMP-POUCH-P", price_eur: "11,50" }),
    ].join("\n");
    const done = await importCsv(csv, false);
    expect(done.products[0]).toMatchObject({ action: "update", status: "published" });
    const [after] = await handle.db.select().from(variants).where(eq(variants.sku, "IMP-POUCH-P"));
    expect(after).toMatchObject({ id: before?.id, priceCents: 1150, active: true });
    const [blue] = await handle.db.select().from(variants).where(eq(variants.sku, "IMP-POUCH-B"));
    expect(blue?.active).toBe(false);
  });

  it("imports nothing when one row is wrong (all or nothing)", async () => {
    const csv = [
      header,
      row({ ...complete, slug: "imp-ok", version: "One", sku: "IMP-OK", price_eur: "9" }),
      row({ ...complete, slug: "imp-steal", version: "One", sku: "IMP-POUCH-P", price_eur: "9" }),
    ].join("\n");
    const res = await importCsv(csv, false);
    expect(res.applied).toBe(false);
    expect(res.issues).toEqual([
      { line: 3, column: "sku", code: "sku_of_other_product", value: "IMP-POUCH-P" },
    ]);
    expect(await handle.db.select().from(products).where(eq(products.slug, "imp-ok"))).toHaveLength(0);
  });

  it("is only for signed-in catalogue staff", async () => {
    const saved = cookie;
    cookie = "";
    expect((await call("GET", "/admin-api/products/import-template")).statusCode).toBe(401);
    cookie = saved;
  });
});
