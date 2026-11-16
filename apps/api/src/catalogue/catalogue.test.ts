import { ProductDetail, ProductList } from "@kummie/contracts";
import { describe, expect, it } from "vitest";
import { buildApp } from "../app";
import { createMemoryCatalogueRepository } from "./memory-repository";

function app() {
  return buildApp({ logger: false, checkDb: async () => "ok", catalogue: createMemoryCatalogueRepository() });
}

describe("catalogue routes", () => {
  it("lists categories with their subcategories", async () => {
    const response = await app().inject({ method: "GET", url: "/catalogue/categories" });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { items: { id: string; subcategories: unknown[] }[] };
    expect(body.items).toHaveLength(7);
    expect(body.items.every((c) => c.subcategories.length > 0)).toBe(true);
    expect(response.headers["cache-control"]).toContain("max-age=60");
  });

  it("lists all 99 seeded groups", async () => {
    const response = await app().inject({ method: "GET", url: "/catalogue/groups" });
    expect((response.json() as { items: unknown[] }).items).toHaveLength(99);
  });

  it("filters products by category, generation, limited and text", async () => {
    const get = async (qs: string) => {
      const response = await app().inject({ method: "GET", url: `/catalogue/products${qs}` });
      expect(response.statusCode).toBe(200);
      return ProductList.parse(response.json());
    };
    expect((await get("")).total).toBe(10);
    expect((await get("?cat=albums")).items.map((p) => p.slug)).toEqual([
      "demo-album-skz",
      "demo-album-ive",
      "demo-album-enhypen",
    ]);
    expect((await get("?limited=1")).items.map((p) => p.stateBadge)).toEqual(["LIMITED"]);
    expect((await get("?gen=4&cat=albums")).total).toBe(3);
    expect((await get("?q=binder")).items[0]?.slug).toBe("kum-binder");
    const page = await get("?pageSize=4&page=3");
    expect(page.items).toHaveLength(2);
    expect(page.total).toBe(10);
  });

  it("rejects invalid filters with 400", async () => {
    const response = await app().inject({ method: "GET", url: "/catalogue/products?gen=9" });
    expect(response.statusCode).toBe(400);
  });

  it("returns a product with every GPSR field, or 404", async () => {
    const ok = await app().inject({ method: "GET", url: "/catalogue/products/demo-album-skz" });
    expect(ok.statusCode).toBe(200);
    const product = ProductDetail.parse(ok.json());
    expect(product.priceCents).toBe(1800);
    expect(product.compliance.manufacturer).not.toBe("");
    expect(product.compliance.deliveryRegions).toEqual(["BG", "RO", "GR"]);

    const missing = await app().inject({ method: "GET", url: "/catalogue/products/nope" });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ error: "not_found", message: "Product not found" });
  });

  it("is not registered when there is no database", async () => {
    const bare = buildApp({ logger: false, checkDb: async () => "not_configured" });
    expect((await bare.inject({ method: "GET", url: "/catalogue/products" })).statusCode).toBe(404);
  });
});
