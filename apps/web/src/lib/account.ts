import { ApiRequestError, createAccountClient } from "@kummie/contracts";
import type { MessageKey } from "@kummie/i18n";

/**
 * Account API client for the browser. The session is an HTTP-only cookie on the API host; the shop
 * and the API are on the same site (kummie.eu / api.kummie.eu, locally localhost:3000 / :3001).
 */
export const accountApi = createAccountClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001",
});

/** HTTP status of a failed call, or 0 for network errors. */
export function statusOf(error: unknown): number {
  return error instanceof ApiRequestError ? error.status : 0;
}

/** API error code (e.g. "too_young"), if any. */
export function codeOf(error: unknown): string | undefined {
  return error instanceof ApiRequestError ? error.body?.error : undefined;
}

/** A field of the error body, e.g. `minimumAge`. */
export function detailOf(error: unknown, key: string): unknown {
  return error instanceof ApiRequestError ? (error.body as Record<string, unknown> | null)?.[key] : undefined;
}

/** Message for errors every form shares. */
export function commonErrorKey(error: unknown): MessageKey {
  return statusOf(error) === 429 ? "auth.tooMany" : "auth.error";
}

/** Reads the single-use token from the link's fragment (#t=…), which never reaches a server. */
export function tokenFromHash(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.hash.slice(1)).get("t") ?? "";
}
