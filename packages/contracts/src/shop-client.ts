import type { z } from "zod";
import { ApiRequestError, type FetchLike } from "./client";
import {
  Cart,
  CheckoutResponse,
  OrderDetail,
  OrderList,
  PayResponse,
  type CartLineUpdate,
  type CheckoutRequest,
} from "./shop";

/**
 * Cart, checkout and orders for the web shop (browser). Uses the cart / session cookies on the API
 * host (credentials: "include"). Guests open their order with the key from checkout or the e-mail.
 */
export function createShopClient({
  baseUrl,
  fetch: fetchImpl = fetch,
}: {
  baseUrl: string;
  fetch?: FetchLike;
}) {
  const base = baseUrl.replace(/\/$/, "");

  async function call<T extends z.ZodType>(
    method: "GET" | "POST" | "PUT",
    path: string,
    schema: T,
    body?: unknown,
    headers: Record<string, string> = {},
  ): Promise<z.output<T>> {
    const response = await fetchImpl(`${base}${path}`, {
      method,
      credentials: "include",
      headers: {
        accept: "application/json",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    const json: unknown = text ? JSON.parse(text) : null;
    if (!response.ok) {
      const err = json as { error?: string; message?: string } | null;
      throw new ApiRequestError(
        response.status,
        err?.error ? { error: err.error, message: err.message ?? err.error, ...(json as object) } : null,
      );
    }
    return schema.parse(json);
  }

  const keyHeader = (key?: string | null): Record<string, string> => (key ? { "x-order-key": key } : {});

  return {
    cart: () => call("GET", "/cart", Cart),
    setLine: (update: CartLineUpdate) => call("PUT", "/cart/lines", Cart, update),
    setCountry: (country: "BG" | "RO" | "GR") => call("PUT", "/cart/country", Cart, { country }),
    checkout: (input: CheckoutRequest) => call("POST", "/checkout", CheckoutResponse, input),
    order: (id: string, key?: string | null) =>
      call("GET", `/orders/${id}`, OrderDetail, undefined, keyHeader(key)),
    payAgain: (id: string, key?: string | null) =>
      call("POST", `/orders/${id}/pay`, PayResponse, {}, keyHeader(key)),
    myOrders: () => call("GET", "/account/orders", OrderList),
  };
}

export type ShopClient = ReturnType<typeof createShopClient>;
