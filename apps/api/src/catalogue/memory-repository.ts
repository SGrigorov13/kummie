import type { ProductCard, ProductDetail } from "@kummie/contracts";
import {
  CATEGORIES,
  categoryOf,
  groupById,
  groups,
  products as demoProducts,
  stateBadgeOf,
  type Product,
} from "@kummie/core";
import type { CatalogueRepository } from "./repository";

/**
 * In-memory catalogue built from the @kummie/core demo data. Used by route tests (and as a
 * reference for what the PostgreSQL repository must return); never wired in production.
 */
export function createMemoryCatalogueRepository(
  list: readonly Product[] = demoProducts,
): CatalogueRepository {
  const card = (p: Product): ProductCard => {
    const group = groupById(p.groupId);
    return {
      slug: p.id,
      title: p.title,
      categoryId: categoryOf(p.subcategory).id,
      subcategoryId: p.subcategory,
      groupId: group?.id ?? null,
      groupName: group?.name ?? null,
      sourcing: p.sourcing,
      stateBadge: stateBadgeOf(p) ?? null,
      isLimited: p.isLimited,
      priceCents: p.priceCents,
      currency: "EUR",
      image: null,
      isDemo: p.demo,
    };
  };

  return {
    async listCategories() {
      return CATEGORIES.map((c) => ({ id: c.id, bg: c.bg, en: c.en, subcategories: [...c.subcategories] }));
    },
    async listGroups() {
      return groups.map((g) => ({ ...g, aka: g.aka ?? null }));
    },
    async listProducts(f) {
      const q = f.q?.toLowerCase();
      const matches = list.filter((p) => {
        const group = groupById(p.groupId);
        if (f.cat && categoryOf(p.subcategory).id !== f.cat) return false;
        if (f.sub && p.subcategory !== f.sub) return false;
        if (f.gen && group?.generation !== f.gen) return false;
        if (f.group && p.groupId !== f.group) return false;
        if (f.limited && !p.isLimited) return false;
        if (q) {
          const hay = [p.title, p.summary.bg, p.summary.en, group?.name ?? "", group?.aka ?? ""]
            .join(" ")
            .toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });
      const start = (f.page - 1) * f.pageSize;
      return { items: matches.slice(start, start + f.pageSize).map(card), total: matches.length };
    },
    async getProduct(slug) {
      const p = list.find((item) => item.id === slug);
      if (!p) return null;
      const detail: ProductDetail = {
        ...card(p),
        summary: p.summary,
        variants: [
          {
            id: `${p.id}-v1`,
            sku: `${p.id.toUpperCase()}-1`,
            version: p.version,
            priceCents: p.priceCents,
            available: true,
          },
        ],
        compliance: {
          dispatchEstimate: p.dispatchEstimate,
          deliveryRegions: p.deliveryRegions,
          manufacturer: p.compliance.manufacturer,
          euResponsiblePerson: p.compliance.responsiblePerson,
          safetyInfo: p.compliance.safetyInfo ?? null,
          warnings: p.compliance.warnings ?? [],
          returnExceptions: p.returnExceptions ?? [],
        },
        images: [],
      };
      return detail;
    },
  };
}
