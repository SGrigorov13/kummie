/**
 * Merch taxonomy, category → subcategory, from `data/seed/merch-taxonomy.json` (D-012).
 * Kept as typed constants; `taxonomy.test.ts` fails if this drifts from the seed file.
 * "Limited" is not a category — it is `product.isLimited`.
 */
export const TAXONOMY = [
  {
    id: "albums",
    bg: "Албуми",
    en: "Albums",
    subcategories: [
      { id: "album", bg: "Албум", en: "Album" },
      { id: "photobook", bg: "Фотокнига", en: "Photobook" },
    ],
  },
  {
    id: "photocards-paper",
    bg: "Фотокарти и хартия",
    en: "Photocards & paper",
    subcategories: [
      { id: "photocards", bg: "Фотокарти", en: "Photocards" },
      { id: "posters", bg: "Постери", en: "Posters" },
      { id: "mini-posters", bg: "Мини постери", en: "Mini posters" },
      { id: "postcards", bg: "Картички", en: "Postcards" },
      { id: "stickers", bg: "Стикери", en: "Stickers" },
      { id: "lyrics-books", bg: "Книжки с текстове", en: "Lyrics books" },
      { id: "calendars", bg: "Календари", en: "Calendars" },
      { id: "stationery", bg: "Канцелария", en: "Stationery" },
    ],
  },
  {
    id: "apparel",
    bg: "Облекло",
    en: "Apparel",
    subcategories: [
      { id: "t-shirts", bg: "Тениски", en: "T-shirts" },
      { id: "hoodies", bg: "Суитшърти с качулка", en: "Hoodies" },
      { id: "sweatshirts", bg: "Блузи", en: "Sweatshirts" },
      { id: "jackets", bg: "Якета", en: "Jackets" },
      { id: "caps", bg: "Шапки", en: "Caps" },
      { id: "other-apparel", bg: "Друго облекло", en: "Other apparel" },
    ],
  },
  {
    id: "accessories",
    bg: "Аксесоари",
    en: "Accessories",
    subcategories: [
      { id: "keychains", bg: "Ключодържатели", en: "Keychains" },
      { id: "bags", bg: "Чанти", en: "Bags" },
      { id: "pouches", bg: "Несесери", en: "Pouches" },
      { id: "pins-badges", bg: "Значки", en: "Pins & badges" },
      { id: "jewelry", bg: "Бижута", en: "Jewelry" },
      { id: "phone-accessories", bg: "За телефона", en: "Phone accessories" },
      { id: "cups-tumblers", bg: "Чаши и термоси", en: "Cups & tumblers" },
    ],
  },
  {
    id: "collectibles",
    bg: "Колекционерски",
    en: "Collectibles",
    subcategories: [
      { id: "dolls", bg: "Кукли", en: "Dolls" },
      { id: "character-merch", bg: "Персонажи", en: "Character merchandise" },
    ],
  },
  {
    id: "concert-tour",
    bg: "Концерти и турнета",
    en: "Concert & tour",
    subcategories: [
      { id: "lightsticks", bg: "Лайтстикове", en: "Lightsticks" },
      { id: "concert-merch", bg: "Концертен мърч", en: "Concert merchandise" },
      { id: "tour-merch", bg: "Мърч от турнета", en: "Tour merchandise" },
    ],
  },
  {
    id: "collector-supplies",
    bg: "За колекцията",
    en: "Collector supplies",
    subcategories: [
      { id: "binders", bg: "Класьори", en: "Binders" },
      { id: "sleeves", bg: "Джобчета", en: "Sleeves" },
      { id: "toploaders", bg: "Топлоудъри", en: "Toploaders" },
      { id: "storage", bg: "Кутии", en: "Storage" },
    ],
  },
] as const;

/** Product attributes that are deliberately not categories. */
export const PRODUCT_ATTRIBUTES = {
  keychainType: ["character", "member", "logo", "plush"],
  photocardType: ["album", "official", "pob", "lucky-draw", "event", "fansign-exclusive"],
  inclusions: ["random", "special-limited", "guaranteed"],
} as const;

type TaxonomyEntry = (typeof TAXONOMY)[number];

export type CategoryId = TaxonomyEntry["id"];
export type SubcategoryId = TaxonomyEntry["subcategories"][number]["id"];

export type Subcategory = { id: SubcategoryId; bg: string; en: string };
export type Category = { id: CategoryId; bg: string; en: string; subcategories: readonly Subcategory[] };

export const CATEGORIES: readonly Category[] = TAXONOMY;

export function isCategoryId(value: string): value is CategoryId {
  return CATEGORIES.some((category) => category.id === value);
}

export function isSubcategoryId(value: string): value is SubcategoryId {
  return CATEGORIES.some((category) => category.subcategories.some((sub) => sub.id === value));
}

export function categoryById(id: CategoryId): Category {
  const found = CATEGORIES.find((category) => category.id === id);
  if (!found) throw new Error(`Unknown category ${id}`);
  return found;
}

export function categoryOf(subcategory: SubcategoryId): Category {
  const found = CATEGORIES.find((category) => category.subcategories.some((sub) => sub.id === subcategory));
  if (!found) throw new Error(`Unknown subcategory ${subcategory}`);
  return found;
}

export function subcategoryById(id: SubcategoryId): Subcategory {
  return categoryOf(id).subcategories.find((sub) => sub.id === id) as Subcategory;
}
