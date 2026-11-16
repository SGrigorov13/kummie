import { describe, expect, it } from "vitest";
import { ProductListQuery } from "./catalogue";
import { ApiRequestError, createApiClient, type FetchLike } from "./client";

function fakeFetch(status: number, body: unknown, seen: string[] = []): FetchLike {
  return async (url) => {
    seen.push(url);
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  };
}

describe("ProductListQuery", () => {
  it("coerces query-string values and applies defaults", () => {
    expect(ProductListQuery.parse({ gen: "4", limited: "1" })).toEqual({
      gen: 4,
      limited: true,
      page: 1,
      pageSize: 24,
    });
    expect(() => ProductListQuery.parse({ gen: "9" })).toThrow();
    expect(() => ProductListQuery.parse({ pageSize: "500" })).toThrow();
  });
});

describe("api client", () => {
  it("builds the query string and validates the response", async () => {
    const seen: string[] = [];
    const client = createApiClient({
      baseUrl: "http://api.test/",
      fetch: fakeFetch(200, { items: [], total: 0, page: 1, pageSize: 24 }, seen),
    });
    const list = await client.listProducts({ cat: "albums", limited: true, q: "" });
    expect(list.total).toBe(0);
    expect(seen[0]).toBe("http://api.test/catalogue/products?cat=albums&limited=true");
  });

  it("rejects a response that does not match the contract", async () => {
    const client = createApiClient({ baseUrl: "http://api.test", fetch: fakeFetch(200, { items: "nope" }) });
    await expect(client.listProducts()).rejects.toThrow();
  });

  it("turns API errors into ApiRequestError with the server message", async () => {
    const client = createApiClient({
      baseUrl: "http://api.test",
      fetch: fakeFetch(404, { error: "not_found", message: "No such product" }),
    });
    const error = await client.getProduct("missing").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect((error as ApiRequestError).status).toBe(404);
    expect((error as ApiRequestError).message).toBe("No such product");
  });
});
