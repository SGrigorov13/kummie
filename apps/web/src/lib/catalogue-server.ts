import { ApiRequestError, createApiClient, type Category } from "@kummie/contracts";
import { notFound } from "next/navigation";

/**
 * Catalogue client for server components. The web server may reach the API by an internal
 * address (API_INTERNAL_URL); otherwise the public one. Answers are cached for a minute (ISR), so a
 * product published in the admin shows up within about a minute without a rebuild.
 */
export const REVALIDATE_SECONDS = 60;

export const catalogue = createApiClient({
  // || rather than ??: an empty value in .env means "not set".
  baseUrl: process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001",
  fetch: (input, init) => fetch(input, { ...init, next: { revalidate: REVALIDATE_SECONDS } }),
});

/** Runs a catalogue call; null when the API is not reachable (the page shows a short notice). */
export async function tryCatalogue<T>(call: () => Promise<T>): Promise<T | null> {
  try {
    return await call();
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 404) notFound();
    return null;
  }
}

/** Subcategory id → its category and names (for labels and links). */
export function subcategoryIndex(categories: readonly Category[]) {
  const index = new Map<string, { category: Category; bg: string; en: string }>();
  for (const category of categories) {
    for (const sub of category.subcategories) index.set(sub.id, { category, bg: sub.bg, en: sub.en });
  }
  return index;
}
