import type { Category, Group, ProductCard, ProductDetail, ProductListFilters } from "@kummie/contracts";

/** Read side of the catalogue. Only published products are ever returned. */
export interface CatalogueRepository {
  listCategories(): Promise<Category[]>;
  listGroups(): Promise<Group[]>;
  listProducts(filters: ProductListFilters): Promise<{ items: ProductCard[]; total: number }>;
  getProduct(slug: string): Promise<ProductDetail | null>;
}

/** Public URL of a stored image path (disk storage on Bulinfo, served by Apache). */
export function mediaUrl(mediaBaseUrl: string, path: string): string {
  return `${mediaBaseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}
