import type { z } from "zod";
import {
  ApiError,
  CategoryList,
  GroupList,
  ProductDetail,
  ProductList,
  type ProductListQuery,
} from "./catalogue";
import { Health } from "./health";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiError | null,
  ) {
    super(body?.message ?? `API request failed with HTTP ${status}`);
    this.name = "ApiRequestError";
  }
}

export type ApiClientOptions = {
  /** e.g. "http://localhost:3001" or "https://api.kummie.eu". */
  baseUrl: string;
  fetch?: FetchLike;
  headers?: Record<string, string>;
};

function toSearch(query: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

/** Typed client for the KUMMIE API. Every response is validated with the shared schema. */
export function createApiClient({ baseUrl, fetch: fetchImpl = fetch, headers = {} }: ApiClientOptions) {
  const base = baseUrl.replace(/\/$/, "");

  async function get<T extends z.ZodType>(path: string, schema: T): Promise<z.output<T>> {
    const response = await fetchImpl(`${base}${path}`, {
      headers: { accept: "application/json", ...headers },
    });
    const text = await response.text();
    const json: unknown = text ? JSON.parse(text) : null;
    if (!response.ok) {
      const parsed = ApiError.safeParse(json);
      throw new ApiRequestError(response.status, parsed.success ? parsed.data : null);
    }
    return schema.parse(json);
  }

  return {
    health: () => get("/health", Health),
    listCategories: () => get("/catalogue/categories", CategoryList),
    listGroups: () => get("/catalogue/groups", GroupList),
    listProducts: (query: ProductListQuery = {}) => get(`/catalogue/products${toSearch(query)}`, ProductList),
    getProduct: (slug: string) => get(`/catalogue/products/${encodeURIComponent(slug)}`, ProductDetail),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
