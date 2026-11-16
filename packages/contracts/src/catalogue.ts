import { z } from "zod";

/** Bilingual text. Bulgarian is the default locale. */
export const Localized = z.object({ bg: z.string(), en: z.string() });
export type Localized = z.infer<typeof Localized>;

export const Country = z.enum(["BG", "RO", "GR", "PL"]);
export const Sourcing = z.enum(["OFFICIAL", "KUMMIE_ORIGINAL", "LICENSED", "SUPPLIER_DIRECT"]);
/** The state badge shown to customers; LIMITED comes from `isLimited` (badges.json rules). */
export const StateBadge = z.enum(["LIMITED", "NEW_DROP", "IN_STOCK_EU", "PRE_ORDER"]);
export const Generation = z.number().int().min(1).max(5);

export const Subcategory = z.object({ id: z.string(), bg: z.string(), en: z.string() });
export const Category = z.object({
  id: z.string(),
  bg: z.string(),
  en: z.string(),
  subcategories: z.array(Subcategory),
});
export type Category = z.infer<typeof Category>;
export const CategoryList = z.object({ items: z.array(Category) });

export const Group = z.object({
  id: z.string(),
  name: z.string(),
  generation: Generation,
  aka: z.string().nullable(),
  editorialCheck: z.boolean(),
});
export type Group = z.infer<typeof Group>;
export const GroupList = z.object({ items: z.array(Group) });

export const ProductImage = z.object({
  url: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  alt: Localized,
});

/** What a product card needs: 3:4 image, title, one sourcing badge, price, at most one state badge. */
export const ProductCard = z.object({
  slug: z.string(),
  title: z.string(),
  categoryId: z.string(),
  subcategoryId: z.string(),
  groupId: z.string().nullable(),
  groupName: z.string().nullable(),
  sourcing: Sourcing,
  stateBadge: StateBadge.nullable(),
  isLimited: z.boolean(),
  /** Lowest active variant price, cents incl. VAT, the same in every country (D-025). */
  priceCents: z.number().int().positive(),
  currency: z.literal("EUR"),
  image: ProductImage.nullable(),
  isDemo: z.boolean(),
});
export type ProductCard = z.infer<typeof ProductCard>;

export const Variant = z.object({
  id: z.string(),
  sku: z.string(),
  version: z.string(),
  priceCents: z.number().int().positive(),
});

/** Every field the product page renders under GPSR Art. 19. */
export const Compliance = z.object({
  dispatchEstimate: Localized,
  deliveryRegions: z.array(Country),
  manufacturer: z.string(),
  euResponsiblePerson: z.string(),
  safetyInfo: Localized.nullable(),
  warnings: z.array(Localized),
  returnExceptions: z.array(Localized),
});

export const ProductDetail = ProductCard.extend({
  summary: Localized,
  variants: z.array(Variant).min(1),
  compliance: Compliance,
  images: z.array(ProductImage),
});
export type ProductDetail = z.infer<typeof ProductDetail>;

const flag = z
  .union([z.boolean(), z.enum(["1", "0", "true", "false"])])
  .transform((v) => v === true || v === "1" || v === "true");

export const ProductListQuery = z.object({
  cat: z.string().min(1).optional(),
  sub: z.string().min(1).optional(),
  gen: z.coerce.number().int().min(1).max(5).optional(),
  group: z.string().min(1).optional(),
  limited: flag.optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
});
export type ProductListQuery = z.input<typeof ProductListQuery>;
export type ProductListFilters = z.output<typeof ProductListQuery>;

export const ProductList = z.object({
  items: z.array(ProductCard),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});
export type ProductList = z.infer<typeof ProductList>;

export const ProductSlugParams = z.object({ slug: z.string().regex(/^[a-z0-9-]{1,80}$/) });

export const ApiError = z.object({ error: z.string(), message: z.string() });
export type ApiError = z.infer<typeof ApiError>;
