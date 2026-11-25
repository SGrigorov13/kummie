import type { z } from "zod";
import {
  AdminImageList,
  AdminProduct,
  AdminProductList,
  CompanySettings,
  LoginResponse,
  OkResponse,
  ProductImportReport,
  SalesReadiness,
  Staff,
  type ProductInput,
} from "./admin";
import { CategoryList, GroupList } from "./catalogue";
import { ApiRequestError, type FetchLike } from "./client";
import { AdminOrder, AdminOrderList, type OrderStatusChange } from "./shop";

/**
 * Client for the staff API. Uses the HTTP-only session cookie (credentials: "include"); every
 * request is JSON, which forces a CORS preflight and keeps form-based CSRF out.
 */
export function createAdminClient({
  baseUrl,
  fetch: fetchImpl = fetch,
}: {
  baseUrl: string;
  fetch?: FetchLike;
}) {
  const base = baseUrl.replace(/\/$/, "");

  async function call<T extends z.ZodType>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    schema: T,
    body?: unknown,
  ): Promise<z.output<T>> {
    // A photo goes as its own bytes with its image type (still not sendable by a form: preflight).
    const file = body instanceof Blob ? body : null;
    const response = await fetchImpl(`${base}${path}`, {
      method,
      credentials: "include",
      headers: {
        accept: "application/json",
        ...(file
          ? { "content-type": file.type || "application/octet-stream" }
          : body === undefined
            ? {}
            : { "content-type": "application/json" }),
      },
      body: file ?? (body === undefined ? undefined : JSON.stringify(body)),
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

  return {
    login: (email: string, password: string) =>
      call("POST", "/admin-api/auth/login", LoginResponse, { email, password }),
    verifyTotp: (challenge: string, code: string) =>
      call("POST", "/admin-api/auth/totp", Staff, { challenge, code }),
    enrollTotp: (challenge: string, code: string) =>
      call("POST", "/admin-api/auth/enroll", Staff, { challenge, code }),
    logout: () => call("POST", "/admin-api/auth/logout", OkResponse, {}),
    me: () => call("GET", "/admin-api/me", Staff),
    getCompany: () => call("GET", "/admin-api/settings/company", CompanySettings),
    saveCompany: (settings: CompanySettings) =>
      call("PUT", "/admin-api/settings/company", CompanySettings, settings),
    listProducts: (q?: string) =>
      call("GET", `/admin-api/products${q ? `?q=${encodeURIComponent(q)}` : ""}`, AdminProductList),
    getProduct: (id: string) => call("GET", `/admin-api/products/${id}`, AdminProduct),
    createProduct: (input: ProductInput) => call("POST", "/admin-api/products", AdminProduct, input),
    updateProduct: (id: string, input: ProductInput) =>
      call("PUT", `/admin-api/products/${id}`, AdminProduct, input),
    publishProduct: (id: string) => call("POST", `/admin-api/products/${id}/publish`, AdminProduct, {}),
    unpublishProduct: (id: string) => call("POST", `/admin-api/products/${id}/unpublish`, AdminProduct, {}),
    listOrders: (query: { status?: string; q?: string; page?: number } = {}) => {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== "") params.set(k, String(v));
      const search = params.toString();
      return call("GET", `/admin-api/orders${search ? `?${search}` : ""}`, AdminOrderList);
    },
    getOrder: (id: string) => call("GET", `/admin-api/orders/${id}`, AdminOrder),
    changeOrderStatus: (id: string, change: OrderStatusChange) =>
      call("POST", `/admin-api/orders/${id}/status`, AdminOrder, change),
    /** Direct links (the staff cookie goes along): document PDFs and the monthly reports. */
    documentUrl: (orderId: string, documentId: string) =>
      `${base}/admin-api/orders/${orderId}/documents/${documentId}`,
    reportUrl: (report: "nap-audit" | "sales", year: number, month: number) =>
      `${base}/admin-api/reports/${report}?year=${year}&month=${month}`,
    ossReportUrl: (year: number, quarter: number) =>
      `${base}/admin-api/reports/oss?year=${year}&quarter=${quarter}`,
    /** CSV template for the product import (direct link; the staff cookie goes along). */
    importTemplateUrl: () => `${base}/admin-api/products/import-template`,
    importProducts: (csv: string, dryRun: boolean) =>
      call("POST", "/admin-api/products/import", ProductImportReport, { csv, dryRun }),
    salesReadiness: () => call("GET", "/admin-api/sales", SalesReadiness),
    setSales: (enabled: boolean) => call("PUT", "/admin-api/sales", SalesReadiness, { enabled }),
    approveLegalPage: (page: string, approved: boolean) =>
      call("PUT", "/admin-api/sales/legal", SalesReadiness, { page, approved }),
    addNapUpdate: (input: { kind: string; changedOn: string; note: string | null }) =>
      call("POST", "/admin-api/sales/nap-updates", SalesReadiness, input),
    markNapUpdateSubmitted: (id: string) =>
      call("POST", `/admin-api/sales/nap-updates/${id}/submitted`, SalesReadiness, {}),
    listImages: (productId: string) => call("GET", `/admin-api/products/${productId}/images`, AdminImageList),
    /** Uploads one photo (JPEG, PNG, WebP or AVIF); the server makes the sizes and strips EXIF. */
    uploadImage: (productId: string, file: Blob) =>
      call("POST", `/admin-api/products/${productId}/images`, AdminImageList, file),
    saveImageAlt: (productId: string, imageId: string, alt: { bg: string; en: string }) =>
      call("PUT", `/admin-api/products/${productId}/images/${imageId}`, AdminImageList, { alt }),
    orderImages: (productId: string, ids: string[]) =>
      call("PUT", `/admin-api/products/${productId}/images-order`, AdminImageList, { ids }),
    deleteImage: (productId: string, imageId: string) =>
      call("DELETE", `/admin-api/products/${productId}/images/${imageId}`, AdminImageList),
    categories: () => call("GET", "/catalogue/categories", CategoryList),
    groups: () => call("GET", "/catalogue/groups", GroupList),
  };
}

export type AdminClient = ReturnType<typeof createAdminClient>;
