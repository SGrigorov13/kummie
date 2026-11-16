import type { SubcategoryId } from "./taxonomy";

export type Locale = "bg" | "en";
export const LOCALES = ["bg", "en"] as const satisfies readonly Locale[];
export const DEFAULT_LOCALE: Locale = "bg";

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/** Countries with a VAT rate in the table. Poland follows about a month after launch. */
export type Country = "BG" | "RO" | "GR" | "PL";

export type Localized = { bg: string; en: string };

export type Sourcing = "OFFICIAL" | "KUMMIE_ORIGINAL" | "LICENSED" | "SUPPLIER_DIRECT";
export type ProductState = "LIMITED" | "NEW_DROP" | "IN_STOCK_EU" | "PRE_ORDER";
export type BadgeId = Sourcing | ProductState;

export type Product = {
  id: string;
  /** Two lines max in cards. */
  title: string;
  summary: Localized;
  subcategory: SubcategoryId;
  groupId?: string;
  sourcing: Sourcing;
  /** Never "LIMITED": the LIMITED badge comes only from `isLimited`. */
  state?: Exclude<ProductState, "LIMITED">;
  /** The ONLY thing that turns the UI pink. */
  isLimited: boolean;
  /** Exact version / variant. Required on every product page (GPSR Art. 19). */
  version: string;
  /**
   * Consumer price in integer euro cents, INCLUDING VAT. The same in every country (D-025); the VAT
   * inside it depends on the destination and is worked out by `quoteCart`.
   */
  priceCents: number;
  currency: "EUR";
  dispatchEstimate: Localized;
  deliveryRegions: Country[];
  compliance: {
    manufacturer: string;
    responsiblePerson: string;
    warnings?: Localized[];
    safetyInfo?: Localized;
  };
  returnExceptions?: Localized[];
  /** Sample catalogue only. Never treat as live stock or authorisation. */
  demo: true;
};

export type Generation = 1 | 2 | 3 | 4 | 5;

/** Artist/group metadata only — no logos, photos or artwork. */
export type Group = {
  id: string;
  name: string;
  generation: Generation;
  aka?: string;
  /** True until an editor confirms the entry (D-012). */
  editorialCheck: boolean;
};

export type Article = {
  slug: string;
  section: "magazine" | "teen";
  title: Localized;
  dek: Localized;
  paragraphs: Localized[];
};

export type CalendarEntry = {
  id: string;
  groupId: string;
  title: Localized;
  /** ISO date. */
  when: string;
  kind: Localized;
};
