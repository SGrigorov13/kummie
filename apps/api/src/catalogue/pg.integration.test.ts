import { resolve } from "node:path";
import { eq, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type DatabaseHandle } from "../db/client";
import { productCompliance, products, variants } from "../db/schema";
import { seed } from "../db/seed";
import { createPgCatalogueRepository } from "./pg-repository";
import { publishProduct, PublishBlockedError } from "./publish";

/**
 * Runs against a real PostgreSQL only when TEST_DATABASE_URL points to a database whose name ends in
 * "_test" (CI service container, or the owner's local `kummie_test`). The database is wiped first —
 * the name check makes sure that never happens to a real database.
 */
const url = process.env.TEST_DATABASE_URL;
const safe = !!url && /\/[^/?]+_test(\?|$)/.test(url);

describe.skipIf(!safe)("catalogue on PostgreSQL", () => {
  let handle: DatabaseHandle;

  beforeAll(async () => {
    handle = createDatabase(url as string, 2);
    await handle.db.execute(sql`drop schema if exists public cascade`);
    await handle.db.execute(sql`drop schema if exists drizzle cascade`);
    await handle.db.execute(sql`create schema public`);
    await migrate(handle.db, { migrationsFolder: resolve(import.meta.dirname, "../../drizzle") });
  });

  afterAll(async () => {
    await handle?.close();
  });

  it("seeds reference data and publishes the demo products through the gate", async () => {
    const first = await seed(handle.db);
    expect(first).toMatchObject({ groups: 99, categories: 7, products: 10, created: 10 });
    const again = await seed(handle.db);
    expect(again.created).toBe(0);
  });

  it("lists and filters published products with the lowest variant price", async () => {
    const repo = createPgCatalogueRepository(handle.db, "/media");
    const all = await repo.listProducts({ page: 1, pageSize: 24 });
    expect(all.total).toBe(10);
    const albums = await repo.listProducts({ cat: "albums", page: 1, pageSize: 24 });
    expect(albums.items.map((p) => p.slug).toSorted()).toEqual([
      "demo-album-enhypen",
      "demo-album-ive",
      "demo-album-skz",
    ]);
    const limited = await repo.listProducts({ limited: true, page: 1, pageSize: 24 });
    expect(limited.items.map((p) => [p.slug, p.stateBadge])).toEqual([["kum-toploader", "LIMITED"]]);
    const search = await repo.listProducts({ q: "stray", page: 1, pageSize: 24 });
    expect(search.items.map((p) => p.slug).toSorted()).toEqual(["demo-album-skz", "demo-lightstick"]);
    const wildcard = await repo.listProducts({ q: "%", page: 1, pageSize: 24 });
    expect(wildcard.total).toBe(0);
  });

  it("returns the product page data", async () => {
    const repo = createPgCatalogueRepository(handle.db, "/media");
    const product = await repo.getProduct("demo-album-skz");
    expect(product?.priceCents).toBe(1800);
    expect(product?.compliance.returnExceptions).toHaveLength(1);
    expect(product?.variants[0]?.sku).toBe("DEMO-ALBUM-SKZ-1");
    expect(await repo.getProduct("nope")).toBeNull();
  });

  it("refuses to publish a product without its GPSR fields", async () => {
    const [draft] = await handle.db
      .insert(products)
      .values({
        slug: "draft-without-data",
        title: "Draft",
        subcategoryId: "binders",
        sourcing: "KUMMIE_ORIGINAL",
      })
      .returning({ id: products.id });
    const id = draft?.id as string;
    const error = await publishProduct(handle.db, id).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PublishBlockedError);
    expect((error as PublishBlockedError).missing).toContain("manufacturer");

    await handle.db
      .insert(variants)
      .values({ productId: id, version: "A5", sku: "DRAFT-1", priceCents: 1000 });
    await handle.db.insert(productCompliance).values({
      productId: id,
      dispatchEstimateBg: "3–5 дни",
      dispatchEstimateEn: "3–5 days",
      deliveryRegions: ["BG"],
      manufacturer: "KUMMIE Originals",
      euResponsiblePerson: "СГ Корпорейшън ЕООД",
      safetyNone: true,
      returnExceptionsNone: true,
    });
    await publishProduct(handle.db, id);
    const [row] = await handle.db
      .select({ status: products.status })
      .from(products)
      .where(eq(products.id, id));
    expect(row?.status).toBe("published");
  });

  it("never stores a zero price", async () => {
    const [p] = await handle.db.select({ id: products.id }).from(products).limit(1);
    await expect(
      handle.db
        .insert(variants)
        .values({ productId: p?.id as string, version: "x", sku: "ZERO", priceCents: 0 }),
    ).rejects.toThrow();
  });
});
