import { z } from "zod";
import {
  Account,
  Address,
  AddressList,
  Preferences,
  SignUpResponse,
  type AddressInput,
  type ProfileUpdate,
  type SignUpRequest,
} from "./account";
import { OkResponse } from "./admin";
import { ApiRequestError, type FetchLike } from "./client";

/**
 * Client for customer accounts, used by the web shop in the browser. The session is an HTTP-only
 * cookie on the API host (credentials: "include"); writes are JSON, so other sites cannot forge
 * them without passing CORS.
 */
export function createAccountClient({
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
    const response = await fetchImpl(`${base}${path}`, {
      method,
      credentials: "include",
      headers: {
        accept: "application/json",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    const json: unknown = text ? JSON.parse(text) : null;
    if (!response.ok) {
      const err = json as { error?: string; message?: string } | null;
      throw new ApiRequestError(
        response.status,
        // Keep extra fields such as `minimumAge` for the form messages.
        err?.error ? { error: err.error, message: err.message ?? err.error, ...(json as object) } : null,
      );
    }
    return schema.parse(json);
  }

  return {
    signUp: (input: SignUpRequest) => call("POST", "/auth/signup", SignUpResponse, input),
    verifyEmail: (token: string) => call("POST", "/auth/verify", Account, { token }),
    resendVerification: (email: string, locale?: "bg" | "en") =>
      call("POST", "/auth/resend", OkResponse, { email, ...(locale ? { locale } : {}) }),
    signIn: (email: string, password: string) => call("POST", "/auth/signin", Account, { email, password }),
    signOut: () => call("POST", "/auth/signout", OkResponse, {}),
    forgotPassword: (email: string, locale?: "bg" | "en") =>
      call("POST", "/auth/forgot", OkResponse, { email, ...(locale ? { locale } : {}) }),
    resetPassword: (token: string, password: string) =>
      call("POST", "/auth/reset", Account, { token, password }),

    me: () => call("GET", "/account/me", Account),
    updateProfile: (input: ProfileUpdate) => call("PUT", "/account/profile", Account, input),
    addresses: () => call("GET", "/account/addresses", AddressList),
    addAddress: (input: AddressInput) => call("POST", "/account/addresses", Address, input),
    updateAddress: (id: string, input: AddressInput) =>
      call("PUT", `/account/addresses/${id}`, Address, input),
    deleteAddress: (id: string) => call("DELETE", `/account/addresses/${id}`, OkResponse),
    preferences: () => call("GET", "/account/preferences", Preferences),
    savePreferences: (input: Preferences) => call("PUT", "/account/preferences", Preferences, input),
    /** GDPR Art. 15/20: everything we hold about the account, as JSON. */
    exportData: () => call("GET", "/account/export", z.record(z.string(), z.unknown())),
    /** GDPR Art. 17: closes the account now; personal data is erased by the next background run. */
    deleteAccount: (password: string) => call("POST", "/account/delete", OkResponse, { password }),
  };
}

export type AccountClient = ReturnType<typeof createAccountClient>;
