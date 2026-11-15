export type Locale = "bg" | "en";
export type Country = "BG" | "RO" | "GR";
export type Sourcing = "OFFICIAL" | "KUMMIE_ORIGINAL" | "LICENSED" | "SUPPLIER_DIRECT";
export type ProductState = "LIMITED" | "NEW_DROP" | "IN_STOCK_EU" | "PRE_ORDER";
export type Category = "album" | "merch" | "collect" | "original";

export type Localized = { bg: string; en: string };

export type Product = {
  id: string;
  title: string;
  summary: Localized;
  category: Category;
  groupId?: string;
  sourcing: Sourcing;
  state?: ProductState;
  isLimited: boolean;
  version?: string;
  priceExVat: number;
  currency: "EUR";
  dispatchEstimate: Localized;
  deliveryRegions: Country[];
  compliance: {
    manufacturer?: string;
    responsiblePerson?: string;
    warnings?: Localized[];
    safetyInfo?: Localized;
  };
  returnExceptions?: Localized[];
  /** Sample catalogue only. Never treat as live stock or authorisation. */
  demo: true;
};

export type Group = {
  id: string;
  name: string;
  generation: 1 | 2 | 3 | 4 | 5;
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
  when: string;
  kind: Localized;
};

export type BadgeId = Sourcing | ProductState;

export type Quote = {
  exVat: number;
  vat: number;
  vatRate: number;
  gross: number;
  shipping: number;
  credit: number;
  total: number;
  points: number;
};
