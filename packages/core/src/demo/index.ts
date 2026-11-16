/**
 * @demo Everything in this folder is sample data for the prototype storefront. Nothing here is real
 * stock, a real release date or an authorisation. M1 replaces it with the catalogue API.
 */
import { categoryOf } from "../taxonomy";
import type { Product } from "../types";

export { askKummie } from "./ask";
export type { AssistantReply } from "./ask";
export { articleBySlug, articles, calendar } from "./content";
export { productById, products } from "./products";

/** @demo The prototype's old 4-value category, kept only to style demo placeholders. */
export type DemoCategory = "album" | "merch" | "collect" | "original";

/** @demo Maps a demo product onto the old 4-value category. */
export function demoCategoryOf(product: Pick<Product, "subcategory" | "sourcing">): DemoCategory {
  const category = categoryOf(product.subcategory).id;
  if (category === "albums") return "album";
  if (category === "collector-supplies") return "collect";
  if (product.sourcing === "KUMMIE_ORIGINAL") return "original";
  return "merch";
}
