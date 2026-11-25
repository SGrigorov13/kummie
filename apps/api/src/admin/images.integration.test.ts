import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import type { AdminImageList, LoginResponse } from "@kummie/contracts";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MemoryStorage } from "../adapters/disk-storage";
import { buildApp } from "../app";
import { createSecretBox } from "../auth/crypto";
import { timeStep, totpCode } from "../auth/totp";
import { createPgCatalogueRepository } from "../catalogue/pg-repository";
import { createDatabase, type DatabaseHandle } from "../db/client";
import { auditLog, products } from "../db/schema";
import { seed } from "../db/seed";
import { createStaff } from "./staff-cli";

/** Same safety rule as the other database tests: only databases named *_test, which are wiped. */
const url = process.env.TEST_DATABASE_URL;
const safe = !!url && /\/[^/?]+_test(\?|$)/.test(url);
const ADMIN = "http://localhost:5180";
const PASSWORD = "staff-test-Passw0rd!";

const jpeg = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: { r: 200, g: 80, b: 160 } } })
    .jpeg()
    .toBuffer();

describe.skipIf(!safe)("product photos on PostgreSQL", () => {
  let handle: DatabaseHandle;
  let app: ReturnType<typeof buildApp>;
  const storage = new MemoryStorage("http://api.test/media");
  let cookie = "";
  let productId = "";
  let slug = "";

  const call = (
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    payload?: unknown,
    contentType?: string,
  ) =>
    app.inject({
      method,
      url: path,
      ...(payload === undefined ? {} : { payload: payload as object }),
      headers: { origin: ADMIN, cookie, ...(contentType ? { "content-type": contentType } : {}) },
    });
  const upload = async (body: Buffer, type = "image/jpeg") =>
    call("POST", `/admin-api/products/${productId}/images`, body, type);

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
      catalogue: createPgCatalogueRepository(handle.db, "http://api.test/media"),
      media: storage,
      admin: {
        db: handle.db,
        secretBox: createSecretBox(randomBytes(32).toString("base64")),
        allowedOrigins: [ADMIN],
        cookieSecure: false,
        storage,
      },
    });
    await createStaff(handle.db, {
      email: "pix@kummie.test",
      name: "Pix",
      role: "content",
      password: PASSWORD,
    });
    const login = (
      await call("POST", "/admin-api/auth/login", { email: "pix@kummie.test", password: PASSWORD })
    ).json() as LoginResponse;
    if (login.step !== "enroll") throw new Error("expected enrolment");
    const enrolled = await call("POST", "/admin-api/auth/enroll", {
      challenge: login.challenge,
      code: totpCode(login.secret, timeStep()),
    });
    cookie = String(enrolled.headers["set-cookie"]).split(";")[0] ?? "";
    const [published] = await handle.db
      .select({ id: products.id, slug: products.slug })
      .from(products)
      .where(eq(products.status, "published"))
      .limit(1);
    if (!published) throw new Error("the seed has no published product");
    productId = published.id;
    slug = published.slug;
  });

  afterAll(async () => {
    await app?.close();
    await handle?.close();
  });

  it("uploads photos, makes the sizes and shows them in the shop", async () => {
    const first = await upload(await jpeg(1200, 1600));
    expect(first.statusCode).toBe(200);
    const second = await upload(await jpeg(800, 800));
    const list = second.json() as AdminImageList;
    expect(list.items.map((i) => [i.width, i.height, i.position])).toEqual([
      [1200, 1600, 0],
      [800, 800, 1],
    ]);
    // 1200 px: 480, 960 and 1200 in two formats; 800 px: 480 and 800.
    expect(storage.files.size).toBe(6 + 4);
    expect(list.items[0]?.thumbUrl).toMatch(/^http:\/\/api\.test\/media\/products\/.+-480\.webp$/);

    const file = await app.inject({ method: "GET", url: new URL(list.items[0]?.url ?? "").pathname });
    expect(file.statusCode).toBe(200);
    expect(file.headers["content-type"]).toBe("image/webp");
    expect(file.headers["cache-control"]).toContain("immutable");

    const page = (await app.inject({ method: "GET", url: `/catalogue/products/${slug}` })).json() as {
      images: { sources: { type: string }[]; width: number }[];
    };
    expect(page.images.map((i) => i.width)).toEqual([1200, 800]);
    expect(page.images[0]?.sources.map((s) => s.type)).toEqual(["image/avif", "image/webp"]);
  });

  it("saves alt text, reorders and deletes with the files", async () => {
    const before = (await (
      await call("GET", `/admin-api/products/${productId}/images`)
    ).json()) as AdminImageList;
    const [a, b] = before.items;
    if (!a || !b) throw new Error("expected two photos");
    const alt = await call("PUT", `/admin-api/products/${productId}/images/${b.id}`, {
      alt: { bg: "Калъф отпред", en: "Pouch, front" },
    });
    expect((alt.json() as AdminImageList).items[1]?.alt.en).toBe("Pouch, front");

    const ordered = await call("PUT", `/admin-api/products/${productId}/images-order`, { ids: [b.id, a.id] });
    expect((ordered.json() as AdminImageList).items.map((i) => i.id)).toEqual([b.id, a.id]);
    const wrong = await call("PUT", `/admin-api/products/${productId}/images-order`, { ids: [a.id] });
    expect(wrong.statusCode).toBe(422);

    const removed = await call("DELETE", `/admin-api/products/${productId}/images/${b.id}`);
    expect((removed.json() as AdminImageList).items.map((i) => i.id)).toEqual([a.id]);
    expect(storage.files.size).toBe(6);
    const audits = await handle.db.select().from(auditLog).where(eq(auditLog.entityId, productId));
    expect(audits.map((x) => x.action)).toEqual(
      expect.arrayContaining(["product.image_added", "product.image_alt", "product.image_removed"]),
    );
  });

  it("refuses wrong files and requests from outside the admin", async () => {
    expect((await upload(await jpeg(300, 300))).json()).toMatchObject({ error: "image_too_small" });
    expect((await upload(Buffer.from("<svg/>"), "image/svg+xml")).statusCode).toBe(415);
    expect((await upload(Buffer.from("not an image"), "image/png")).statusCode).toBe(422);
    const anonymous = await app.inject({
      method: "POST",
      url: `/admin-api/products/${productId}/images`,
      payload: await jpeg(600, 600),
      headers: { "content-type": "image/jpeg" },
    });
    expect(anonymous.statusCode).toBe(401);
    const missingFile = await app.inject({ method: "GET", url: "/media/products/x/../../.env" });
    expect(missingFile.statusCode).toBe(404);
  });
});
