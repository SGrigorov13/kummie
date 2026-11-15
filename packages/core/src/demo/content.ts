import type { Article, CalendarEntry } from "../types";

/** @demo Sample articles until Magazine/Teen move to MDX (M4). */
export const articles: readonly Article[] = [
  {
    slug: "what-is-a-photocard",
    section: "magazine",
    title: { bg: "Какво е фотокарта", en: "What is a photocard" },
    dek: {
      bg: "Малка снимка, която идва с албума. Ето как хората я пазят, без да се налага да купуваш всичко наведнъж.",
      en: "A small photo that comes with an album. Here is how people keep one, without buying everything at once.",
    },
    paragraphs: [
      {
        bg: "Фотокартата е малка картонена снимка на участник. Често е в албума, понякога е бонус към поръчка. Всяка версия на албума може да носи различен набор.",
        en: "A photocard is a small photo printed on card. It often sits inside an album, and sometimes it is a bonus with an order. Each album version can carry a different set.",
      },
      {
        bg: "За да остане равна, повечето колекционери я слагат в джоб, а любимите — и в твърд протектор. Класьорът държи комплекта на едно място.",
        en: "To keep it flat, most collectors slide it into a sleeve, and the favourites into a rigid toploader as well. A binder keeps the set in one place.",
      },
      {
        bg: "KUMMIE продава аксесоари със собствен дизайн. Официалните карти идват само като част от истински албум, когато имаме документиран източник. В този локален тест такива карти няма.",
        en: "KUMMIE sells accessories in its own design. Official cards only come inside a real album, and only from a documented source. This local test does not include any.",
      },
    ],
  },
  {
    slug: "album-versions",
    section: "magazine",
    title: { bg: "Защо един албум има няколко версии", en: "Why one album has several versions" },
    dek: {
      bg: "Версията не е същото като песента. Тя е различна опаковка, книжка или набор карти.",
      en: "A version is not the same thing as the song. It is a different package, booklet, or card set.",
    },
    paragraphs: [
      {
        bg: "Един и същ запис често излиза като няколко физически версии. Разликата е в цветовете, книжката и картите вътре. Затова на страницата на продукта пишем точната версия, а не само името на албума.",
        en: "The same recording often ships as several physical versions. The difference is the colours, the booklet, and the cards inside. That is why a product page names the exact version, not only the album.",
      },
      {
        bg: "Ако събираш конкретен участник, версията има значение. Ако искаш само музиката, една версия е достатъчна.",
        en: "If you collect one member, the version matters. If you want the music, one version is enough.",
      },
    ],
  },
  {
    slug: "what-is-a-comeback",
    section: "magazine",
    title: { bg: "Какво е камбек", en: "What is a comeback" },
    dek: {
      bg: "Камбек означава ново издание: песен, клип, албум. Не означава, че групата се е връщала от пауза.",
      en: "A comeback means a new release: a song, a video, an album. It does not mean the group was away.",
    },
    paragraphs: [
      {
        bg: "Феновете казват камбек, когато група пуска нова музика. Около датата има предзакази, версии и понякога лайтстик или друг мърч.",
        en: "Fans say comeback when a group releases new music. Around that date there are pre-orders, versions, and sometimes a lightstick or other merch.",
      },
      {
        bg: "Календарът в това приложение е примерен. Датите не са официални и не идват от компаниите на групите.",
        en: "The calendar in this app is a sample. The dates are not official and do not come from the groups' companies.",
      },
    ],
  },
  {
    slug: "how-to-choose-a-binder",
    section: "magazine",
    title: { bg: "Как да избереш класьор", en: "How to choose a binder" },
    dek: {
      bg: "Почни от броя карти, които вече имаш, не от най-голямата кутия в каталога.",
      en: "Start from the number of cards you already have, not from the biggest box in the catalogue.",
    },
    paragraphs: [
      {
        bg: "Малък класьор стига за първите албуми. Джобовете пазят картата от прах, твърдият протектор е за тези, които вадиш често.",
        en: "A small binder is enough for the first albums. Sleeves keep a card free of dust. A rigid protector is for the ones you take out often.",
      },
      {
        bg: "В демо магазина това са KUMMIE Collector Binder, Sleeve Pack и Toploader Set. Те са собствен дизайн, не официален продукт на група.",
        en: "In the demo shop those are the KUMMIE Collector Binder, Sleeve Pack, and Toploader Set. They are KUMMIE's own design, not a group's official product.",
      },
    ],
  },
  {
    slug: "first-album",
    section: "teen",
    title: { bg: "Първият албум, без натиск", en: "A first album, with no pressure" },
    dek: {
      bg: "От бюрото на Kummie. Едно мнение на млад фен, без име и без профил.",
      en: "From Kummie's desk. One young fan's view, with no name and no profile.",
    },
    paragraphs: [
      {
        bg: "Ако започваш сега, един албум е достатъчен. Избери група, чиито песни вече слушаш, и една версия. Не ти трябва всяка карта от първия ден.",
        en: "If you are starting now, one album is enough. Pick a group whose songs you already play, and one version. You do not need every card on day one.",
      },
      {
        bg: "Аз бих взела класьор чак когато картите станат повече от няколко. Дотогава един плик с джобове ги държи прави.",
        en: "I would buy a binder only once there are more than a few cards. Until then, one pack of sleeves keeps them straight.",
      },
      {
        bg: "Тук няма коментари и няма съобщения. Ако купуваш, плащането и доставката ги решава възрастен.",
        en: "There are no comments here and no messages. If you buy something, an adult handles payment and delivery.",
      },
    ],
  },
  {
    slug: "desk-setup",
    section: "teen",
    title: { bg: "Бюро за слушане, не витрина", en: "A desk for listening, not a display" },
    dek: {
      bg: "Място за албума, слушалките и една кутия. Останалото може да почака.",
      en: "A spot for the album, the headphones, and one box. The rest can wait.",
    },
    paragraphs: [
      {
        bg: "На бюрото ми стигат албумът, който слушам тази седмица, и кутия, в която другите не се прашат. Постерите не са задължителни.",
        en: "My desk only needs the album I am playing this week, and a box so the others stay clean. Posters are optional.",
      },
      {
        bg: "Стикерите на KUMMIE са с нашата звезда. Не слагаме върху тях чужди лога.",
        en: "KUMMIE stickers use our star. We do not put anyone else's logo on them.",
      },
    ],
  },
];

/** @demo */
export function articleBySlug(slug: string): Article | undefined {
  return articles.find((article) => article.slug === slug);
}

/** @demo Sample comeback calendar. Dates are not an official schedule. */
export const calendar: readonly CalendarEntry[] = [
  {
    id: "cal-1",
    groupId: "stray-kids",
    when: "2026-12-04",
    title: { bg: "Примерен предзаказ", en: "Sample pre-order" },
    kind: { bg: "Демо дата, не е официален график", en: "Demo date, not an official schedule" },
  },
  {
    id: "cal-2",
    groupId: "ive",
    when: "2026-12-18",
    title: { bg: "Примерно издание", en: "Sample release" },
    kind: { bg: "Демо дата, не е официален график", en: "Demo date, not an official schedule" },
  },
  {
    id: "cal-3",
    groupId: "enhypen",
    when: "2027-01-09",
    title: { bg: "Примерен клип", en: "Sample video" },
    kind: { bg: "Демо дата, не е официален график", en: "Demo date, not an official schedule" },
  },
];
