import type { Product } from "./types.ts";

const regions = ["BG", "RO", "GR"] as const;

const demoDispatch = {
  bg: "Демо: 7–12 дни след сборната пратка до България",
  en: "Demo: 7–12 days after the consolidated shipment reaches Bulgaria",
};

const sampleWarning = {
  bg: "Примерен артикул за локален тест. Няма реална наличност, доставка или оторизация.",
  en: "Sample item for a local test. No real stock, shipment, or authorisation.",
};

export const products: Product[] = [
  {
    id: "kum-binder",
    title: "KUMMIE Collector Binder",
    category: "original",
    sourcing: "KUMMIE_ORIGINAL",
    state: "IN_STOCK_EU",
    isLimited: false,
    version: "A5 · 20 sheets",
    priceExVat: 18.33,
    currency: "EUR",
    summary: {
      bg: "Класьор за фотокарти с оригинален дизайн на KUMMIE. Без имена, лога или снимки на артисти.",
      en: "Photocard binder in an original KUMMIE design. No artist names, logos, or photographs.",
    },
    dispatchEstimate: {
      bg: "Демо: 3–5 дни от България",
      en: "Demo: 3–5 days from Bulgaria",
    },
    deliveryRegions: [...regions],
    compliance: {
      manufacturer: "KUMMIE Originals (demo manufacturer)",
      responsiblePerson: "KUMMIE, Bulgaria (demo)",
      safetyInfo: {
        bg: "Хартиен продукт за колекциониране. Не е играчка.",
        en: "Paper collecting product. Not a toy.",
      },
    },
    demo: true,
  },
  {
    id: "kum-sleeves",
    title: "KUMMIE Sleeve Pack",
    category: "collect",
    sourcing: "KUMMIE_ORIGINAL",
    state: "IN_STOCK_EU",
    isLimited: false,
    version: "50 sleeves",
    priceExVat: 6.25,
    currency: "EUR",
    summary: {
      bg: "Прозрачни джобове за стандартна фотокарта. Оригинален аксесоар, не официален мърч на група.",
      en: "Clear sleeves for a standard photocard. An original accessory, not a group's official merch.",
    },
    dispatchEstimate: {
      bg: "Демо: 3–5 дни от България",
      en: "Demo: 3–5 days from Bulgaria",
    },
    deliveryRegions: [...regions],
    compliance: {
      manufacturer: "KUMMIE Originals (demo manufacturer)",
      responsiblePerson: "KUMMIE, Bulgaria (demo)",
      warnings: [
        {
          bg: "Пази далеч от открит огън. Не е играчка за деца под 3 години.",
          en: "Keep away from open flame. Not a toy for children under 3.",
        },
      ],
    },
    demo: true,
  },
  {
    id: "kum-toploader",
    title: "KUMMIE Toploader Set",
    category: "collect",
    sourcing: "KUMMIE_ORIGINAL",
    state: "LIMITED",
    isLimited: true,
    version: "10 pieces",
    priceExVat: 9.17,
    currency: "EUR",
    summary: {
      bg: "Твърди протектори за карти, които искаш да показваш. Лимитираната визия е само на опаковката на KUMMIE.",
      en: "Rigid card protectors for the cards you want to display. The limited look is KUMMIE packaging only.",
    },
    dispatchEstimate: {
      bg: "Демо: 3–5 дни от България",
      en: "Demo: 3–5 days from Bulgaria",
    },
    deliveryRegions: [...regions],
    compliance: {
      manufacturer: "KUMMIE Originals (demo manufacturer)",
      responsiblePerson: "KUMMIE, Bulgaria (demo)",
      safetyInfo: {
        bg: "Твърда пластмаса. Не е играчка.",
        en: "Rigid plastic. Not a toy.",
      },
    },
    demo: true,
  },
  {
    id: "kum-box",
    title: "KUMMIE Storage Box",
    category: "collect",
    sourcing: "KUMMIE_ORIGINAL",
    state: "NEW_DROP",
    isLimited: false,
    version: "Holds 4 binders",
    priceExVat: 15.83,
    currency: "EUR",
    summary: {
      bg: "Кутия за класьори и джобове. Нова в демо каталога от последните 14 дни.",
      en: "A box for binders and sleeves. New in the demo catalogue within the last 14 days.",
    },
    dispatchEstimate: {
      bg: "Демо: 3–5 дни от България",
      en: "Demo: 3–5 days from Bulgaria",
    },
    deliveryRegions: [...regions],
    compliance: {
      manufacturer: "KUMMIE Originals (demo manufacturer)",
      responsiblePerson: "KUMMIE, Bulgaria (demo)",
    },
    demo: true,
  },
  {
    id: "kum-tote",
    title: "KUMMIE Tote",
    category: "original",
    sourcing: "KUMMIE_ORIGINAL",
    isLimited: false,
    version: "Cotton · one size",
    priceExVat: 13.33,
    currency: "EUR",
    summary: {
      bg: "Памучна чанта със звездата на KUMMIE. Без артисти и без албумни визии.",
      en: "Cotton tote with the KUMMIE star. No artists and no album artwork.",
    },
    dispatchEstimate: {
      bg: "Демо: 5–8 дни от България",
      en: "Demo: 5–8 days from Bulgaria",
    },
    deliveryRegions: [...regions],
    compliance: {
      manufacturer: "KUMMIE Originals (demo manufacturer)",
      responsiblePerson: "KUMMIE, Bulgaria (demo)",
      safetyInfo: {
        bg: "Състав за демото: 100% памук. Реалният етикет се слага преди истинска продажба.",
        en: "Demo composition: 100% cotton. A real fibre label is required before any actual sale.",
      },
    },
    demo: true,
  },
  {
    id: "kum-stickers",
    title: "KUMMIE Sticker Sheet",
    category: "original",
    sourcing: "KUMMIE_ORIGINAL",
    state: "IN_STOCK_EU",
    isLimited: false,
    version: "6 stickers",
    priceExVat: 4.17,
    currency: "EUR",
    summary: {
      bg: "Стикери със звездата и еквалайзера. Поръчка само с този артикул е под прага за Kummies.",
      en: "Stickers of the star and the equaliser. An order of only this item sits under the Kummies threshold.",
    },
    dispatchEstimate: {
      bg: "Демо: 3–5 дни от България",
      en: "Demo: 3–5 days from Bulgaria",
    },
    deliveryRegions: [...regions],
    compliance: {
      manufacturer: "KUMMIE Originals (demo manufacturer)",
      responsiblePerson: "KUMMIE, Bulgaria (demo)",
    },
    demo: true,
  },
  {
    id: "demo-album-skz",
    title: "Sample album — Stray Kids",
    category: "album",
    groupId: "stray-kids",
    sourcing: "OFFICIAL",
    state: "PRE_ORDER",
    isLimited: false,
    version: "Demo version A",
    priceExVat: 15,
    currency: "EUR",
    summary: {
      bg: "Примерен официален албум в каталога, за да се види баджът и предзаказната страница. Не се продава и не е истински предзаказ.",
      en: "A sample official album so the badge and pre-order page can be tested. It is not for sale and not a real pre-order.",
    },
    dispatchEstimate: demoDispatch,
    deliveryRegions: [...regions],
    compliance: {
      manufacturer: "Not listed — demo SKU",
      responsiblePerson: "Would be required before a real listing",
      warnings: [sampleWarning],
    },
    returnExceptions: [
      {
        bg: "При истински предзаказ отказът следва 14-дневния срок след получаване, освен ако законът не казва друго.",
        en: "On a real pre-order, withdrawal follows the 14-day period after delivery, unless the law says otherwise.",
      },
    ],
    demo: true,
  },
  {
    id: "demo-album-ive",
    title: "Sample album — IVE",
    category: "album",
    groupId: "ive",
    sourcing: "OFFICIAL",
    state: "NEW_DROP",
    isLimited: false,
    version: "Demo version B",
    priceExVat: 14.17,
    currency: "EUR",
    summary: {
      bg: "Втори примерен албум за филтъра по група. Няма снимка на обложката нарочно.",
      en: "A second sample album for the group filter. The cover image is omitted on purpose.",
    },
    dispatchEstimate: demoDispatch,
    deliveryRegions: [...regions],
    compliance: {
      manufacturer: "Not listed — demo SKU",
      responsiblePerson: "Would be required before a real listing",
      warnings: [sampleWarning],
    },
    demo: true,
  },
  {
    id: "demo-album-enhypen",
    title: "Sample album — ENHYPEN",
    category: "album",
    groupId: "enhypen",
    sourcing: "OFFICIAL",
    isLimited: false,
    version: "Demo version C",
    priceExVat: 14.17,
    currency: "EUR",
    summary: {
      bg: "Примерен албум без бадж за състояние, за да се тества карта само с един sourcing бадж.",
      en: "A sample album with no state badge, so a card with only a sourcing badge can be tested.",
    },
    dispatchEstimate: demoDispatch,
    deliveryRegions: [...regions],
    compliance: {
      manufacturer: "Not listed — demo SKU",
      responsiblePerson: "Would be required before a real listing",
      warnings: [sampleWarning],
    },
    demo: true,
  },
  {
    id: "demo-lightstick",
    title: "Sample lightstick case",
    category: "merch",
    groupId: "stray-kids",
    sourcing: "SUPPLIER_DIRECT",
    state: "PRE_ORDER",
    isLimited: false,
    version: "Generic hard case",
    priceExVat: 11.67,
    currency: "EUR",
    summary: {
      bg: "Кутия за лайтстик без лого на група. Баджът показва директна доставка от доставчик в демо модела.",
      en: "A lightstick case with no group logo. The badge shows supplier-direct shipping in the demo model.",
    },
    dispatchEstimate: demoDispatch,
    deliveryRegions: [...regions],
    compliance: {
      manufacturer: "Demo supplier, outside the EU",
      responsiblePerson: "Required before a real electronic or hard-case listing",
      warnings: [sampleWarning],
      safetyInfo: {
        bg: "Не е електронен продукт. Истински лайтстик би минал отделна проверка за безопасност.",
        en: "Not an electronic product. A real lightstick would need its own safety check.",
      },
    },
    demo: true,
  },
];

export function productById(id: string): Product | undefined {
  return products.find((product) => product.id === id);
}
