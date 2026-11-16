import type { BadgeId, Product, ProductState, Sourcing } from "./types";

/** One entry of the closed badge enum (`docs/brand/badges.json`). */
export type BadgeSpec = {
  id: BadgeId;
  bg: string;
  en: string;
  fill: string;
  text: string;
  border?: string;
};

export const sourcingBadges: readonly (BadgeSpec & { id: Sourcing })[] = [
  { id: "OFFICIAL", bg: "ОФИЦИАЛЕН", en: "OFFICIAL", fill: "#FFE44D", text: "#2D0075" },
  { id: "KUMMIE_ORIGINAL", bg: "KUMMIE ORIGINAL", en: "KUMMIE ORIGINAL", fill: "#5B14E5", text: "#FFFFFF" },
  { id: "LICENSED", bg: "ЛИЦЕНЗИРАН", en: "LICENSED", fill: "#2D0075", text: "#FFFFFF" },
  {
    id: "SUPPLIER_DIRECT",
    bg: "ДИРЕКТНА ДОСТАВКА",
    en: "SUPPLIER DIRECT",
    fill: "#FFFFFF",
    text: "#2D0075",
    border: "2px solid #2D0075",
  },
];

export const stateBadges: readonly (BadgeSpec & { id: ProductState })[] = [
  { id: "LIMITED", bg: "ЛИМИТИРАН", en: "LIMITED", fill: "#FF2E9A", text: "#2D0075" },
  { id: "NEW_DROP", bg: "НОВО", en: "NEW DROP", fill: "#B4FF3A", text: "#2D0075" },
  { id: "IN_STOCK_EU", bg: "НАЛИЧЕН В ЕС", en: "IN STOCK — EU", fill: "#B4FF3A", text: "#2D0075" },
  {
    id: "PRE_ORDER",
    bg: "ПРЕДЗАКАЗ",
    en: "PRE-ORDER",
    fill: "#FFFFFF",
    text: "#5B14E5",
    border: "2px solid #5B14E5",
  },
];

export function badgeSpec(id: BadgeId): BadgeSpec {
  const found = [...sourcingBadges, ...stateBadges].find((badge) => badge.id === id);
  if (!found) throw new Error(`Unknown badge ${id}`);
  return found;
}

/**
 * The single state badge a product shows, if any. Hot Pink (LIMITED) is wired to exactly one
 * boolean: `isLimited` — it wins over any other state.
 */
export function stateBadgeOf(product: Pick<Product, "isLimited" | "state">): ProductState | undefined {
  if (product.isLimited) return "LIMITED";
  return product.state;
}
