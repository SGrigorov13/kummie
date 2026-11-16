import { createAdminClient, type AdminClient, type Staff } from "@kummie/contracts";
import { translator, type Locale, type Translate } from "@kummie/i18n";
import { createContext, useContext } from "react";

/** The staff API lives on the API origin; the session cookie travels with every request. */
export const api: AdminClient = createAdminClient({
  baseUrl: import.meta.env.VITE_API_URL ?? "http://localhost:3001",
});

export type AdminContext = {
  locale: Locale;
  t: Translate;
  staff: Staff;
};

const Ctx = createContext<AdminContext>({
  locale: "bg",
  t: translator("bg"),
  staff: { id: "", email: "", name: "", role: "content" },
});

export const AdminProvider = Ctx.Provider;

export function useAdmin(): AdminContext {
  return useContext(Ctx);
}

/** Euros typed by staff ("12,50") → cents, and back. */
export function centsToEuroInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}
