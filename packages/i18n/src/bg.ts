/**
 * Bulgarian copy — the default locale. This object defines the key set; `en.ts` must match it
 * exactly (enforced by the type checker). Placeholders use `{name}` and are filled by `format()`.
 */
export const bg = {
  // ---- Navigation and shell ----
  shop: "Магазин",
  collect: "Колекция",
  magazine: "Списание",
  teen: "Тийн",
  club: "Клуб",
  groups: "Групи",
  calendar: "Календар",
  chingu: "Ask KUMMIE",
  search: "Търсене",
  searchPh: "Група, албум, класьор",
  searchSubmit: "Търси",
  cart: "Количка",
  cartCount: "Количка, артикули: {count}",
  account: "Профил",
  lang: "Език",
  langSwitch: "English",
  skipToContent: "Към съдържанието",
  mainNav: "Основна навигация",
  homeLink: "KUMMIE — начало",
  close: "Затвори",
  back: "Назад",
  open: "Отвори",

  // ---- Promo bar (D-028). Never rendered on Teen routes. Every claim must stay true. ----
  promoBar: "ПОРЪЧАЙ СЕГА * 1 KUMMIE ЗА ВСЯКО ЕВРО ПРИ ПОРЪЧКА ОТ 30 € * БЕЗПЛАТНА ДОСТАВКА СЛЕД 79,99 €",
  promoRegion: "Промоция",
  dismiss: "Затвори промоцията",

  // ---- Footer ----
  footerTagline: "Your K-pop Chingu. Открий. Събери. Свържи се.",
  footerLegal: "Правна информация",
  rights: "Демо интерфейс. Не е магазин и не е правен съвет.",
  withdrawal: "Отказ 14 дни",
  returns: "Връщане",
  guarantee: "Гаранция 2 години",
  privacy: "Поверителност",
  terms: "Условия",
  complaints: "Жалби",

  // ---- Cookie banner ----
  cookieTitle: "Бисквитки",
  cookie: "Използваме само необходимите данни, за да работи този тест. Няма статистика и реклама.",
  cookieOk: "Само необходимите",

  // ---- Home ----
  heroKicker: "Your K-pop Chingu",
  heroTitle: "Открий. Събери. Свържи се.",
  heroBody:
    "Европейско място за K-pop от България. Този екран е демо с примерни артикули, без склад и без плащане.",
  heroCta: "Към магазина",
  heroAlt: "Как да започнеш колекция",
  categoriesTitle: "Категории",
  picks: "KUMMIE Picks",
  bundleHint: "Стартов комплект за карти: джобове, класьор и топлоудър.",
  magazineLead: "Полезни текстове, не новини за нас.",
  guide: "Наръчник",
  clubLead: "Получаваш 1 Kummie за всяко евро от поръчка на стойност от 30 € нагоре.",
  kummiesLeft: "Още {amount} и започваш да трупаш Kummies.",
  clubCta: "Виж клуба",

  // ---- Shop ----
  all: "Всички",
  category: "Категория",
  subcategory: "Подкатегория",
  gen: "Поколение",
  genN: "Поколение {n}",
  results: "Артикули: {count}",
  none: "Няма съвпадение.",
  notFound: "Тази страница не съществува.",

  // ---- Product ----
  demo: "Примерен артикул. Няма реална наличност.",
  add: "Добави в количката",
  added: "Добавено",
  wishlist: "Желани",
  owned: "Имам го",
  vat: "с ДДС",
  priceNote: "Една и съща цена за България, Румъния и Гърция.",
  facts: "Информация за продукта",
  version: "Версия",
  sourcing: "Произход",
  dispatch: "Изпращане",
  regions: "Доставка до",
  maker: "Производител",
  responsible: "Отговорно лице в ЕС",
  safety: "Безопасност",
  warnings: "Предупреждения",
  noWarnings: "Няма специални предупреждения.",
  returnsNote: "Изключения при връщане",
  noReturnExceptions: "Няма изключения извън законовите. Имаш 14 дни за отказ след получаване.",
  group: "Група",
  limited: "Лимитирани",
  status: "Статус",
  explore: "Още от KUMMIE",
  "sourcing.OFFICIAL": "Официален продукт от документиран източник.",
  "sourcing.KUMMIE_ORIGINAL": "Собствен продукт с оригинален дизайн, без чужда интелектуална собственост.",
  "sourcing.LICENSED": "Чужда интелектуална собственост, използвана по документиран лиценз.",
  "sourcing.SUPPLIER_DIRECT": "Изпраща се от доставчика, не от склад в ЕС.",

  // ---- Cart and demo checkout ----
  checkout: "Към демо касата",
  demoNotice: "Демо каса: нищо не се плаща и поръчката остава само на това устройство.",
  subtotal: "Стоки",
  vatLine: "в т.ч. ДДС {rate}%",
  shipping: "Доставка",
  shippingFree: "Безплатна",
  freeShip: "Доставката е подарък от нас при поръчка от 80 € нагоре.",
  freeShipLeft: "Добави още {amount} и доставката е подарък от нас.",
  freeShipReached: "Чудесно — доставката е подарък от нас!",
  deliveryWindow: "Срок: според датата на изпращане на всеки артикул. Без мита и скрити такси.",
  credit: "Отстъпка от Kummies",
  total: "Общо",
  points: "Kummies от тази поръчка",
  place: "Потвърди демо поръчка",
  name: "Име",
  city: "Град",
  address: "Адрес",
  country: "Държава",
  required: "Попълни това поле.",
  empty: "Количката е празна.",
  qty: "Брой",
  remove: "Махни",

  // ---- Orders ----
  order: "Поръчка",
  orders: "Поръчки",
  advance: "Симулирай следваща стъпка",
  localNote: "Статусът се сменя само тук, за да видиш пътя на сборната пратка.",
  noOrders: "Още няма демо поръчка.",
  stepOf: "Стъпка {n} от 7",
  "step.confirmed": "Поръчката е потвърдена",
  "step.batch": "В сборната поръчка към доставчика",
  "step.dispatched": "Сборната пратка е изпратена",
  "step.hub": "Пристигна в пункта в България",
  "step.carrier": "Предадена на куриера",
  "step.out_for_delivery": "На път към теб",
  "step.delivered": "Доставена",
  "status.pending_payment": "Чака плащане.",
  "status.cancelled": "Поръчката е отказана. Ако си платил, парите се връщат по същия начин.",
  "status.refunded": "Сумата е върната изцяло.",
  "status.partially_refunded": "Част от сумата е върната за артикул, който не можем да доставим.",
  "status.exception": "Има проблем с част от поръчката. Ще ти пишем какви са възможностите.",

  // ---- Collection ----
  homeCollect: "Колекцията ти",
  emptyCollect: "Маркирай „Имам го“ или „Желани“ върху артикул.",
  saved: "Записано само на това устройство.",

  // ---- Club ----
  kummies: "Kummies",
  redeem: "Обмени {cost} Kummies за {amount} отстъпка",
  history: "История",
  ageTitle: "Преди клуба и томболата",
  ageUnder: "Под 18",
  ageOver: "На 18 или повече",
  ageNote:
    "Под 18 няма томбола без съгласие на родител и няма публичен профил. Няма и персонализирана реклама.",
  tombola: "Томбола",
  tombolaBody:
    "В локалния тест няма теглене и няма награда. При истинска кампания правилата и шансът се пишат предварително, а участието под 18 иска съгласие на родител.",
  redeemNote: "Обмяна за {amount} отстъпка",
  earnNote: "От поръчка {id} · валидни до {date}",
  kummiesExpiring: "Използвай {count} Kummies до {date} — след това изтичат и отстъпката се губи.",
  kummiesValidity: "Kummies важат {months} месеца от деня на плащане на поръчката.",
  // Expiry reminders (D-031): push ≤ 60 characters, e-mail subject + body. Sent 14, 3 and 1 day before.
  "kummies.reminder14": "⭐ {count} Kummies изтичат след 14 дни — вземи си отстъпка",
  "kummies.reminder3": "⭐ {count} Kummies изтичат след 3 дни — не ги губи",
  "kummies.reminder1": "⭐ Утре изтичат {count} Kummies — използвай ги днес",
  "kummies.reminderEmail":
    "Здравей! Имаш {count} Kummies, които можеш да използваш за {amount} отстъпка в KUMMIE. Валидни са до {date} — след това изчезват. Ще се радваме да ги използваш за нещо хубаво.",

  // ---- Account and notifications ----
  alerts: "Известия",
  comebacks: "Камбеци",
  restocks: "Отново в наличност",
  orderAlerts: "Статус на поръчка",
  orderAlertsNote: "Статусът на поръчка е служебно съобщение и никога не се смесва с реклама.",
  drops: "Club drops и напомняния за изтичащи Kummies",
  kummiesEmailNote: "Напомнянията за изтичащи Kummies идват и по имейл — те са част от програмата на клуба.",
  quiet: "Тих режим 22:00–08:00. Най-много две рекламни известия седмично. В демото няма истински push.",
  reset: "Изчисти локалните данни",

  // ---- Groups and calendar ----
  follow: "Следвай",
  following: "Следваш",
  editorialCheck: "Чака редакторска проверка",
  calendarNote: "Примерни дати. Не са официален график.",

  // ---- Ask KUMMIE ----
  askPh: "Например: какво да купя с 40 €",
  ask: "Питай",
  askLabel: "Препоръка",
  askIntro: "Отговорите са препоръки. Не показвам наличност и не измислям дати.",

  // ---- Teen ----
  teenNote: "K-pop през погледа на млад фен. Без коментари, без профили и без лично име.",

  // ---- Legal pages (prototype text until the real terms are written) ----
  "legal.withdrawal":
    "При истинска продажба в ЕС имаш 14 дни да се откажеш след получаване, с изключенията в закона. Тук няма договор.",
  "legal.returns": "Връщането в демото не изпраща нищо. Истинският процес се пише преди първа продажба.",
  "legal.guarantee":
    "Потребителските стоки в ЕС носят най-малко две години законова гаранция. Този текст не е гаранционна карта.",
  "legal.privacy":
    "Демото пази количка, желани и поръчки в localStorage на този браузър. Няма сървър, няма бисквитки за реклама и няма профил на детето зад KUMMIE Teen.",
  "legal.terms":
    "Това е локален прототип за преглед. Бутонът за поръчка не взима пари и не създава задължение.",
  "legal.complaints":
    "Жалба към истински търговец се подава към него и, ако трябва, към контролния орган. Тук няма търговец.",

  // ---- Countries ----
  "country.BG": "България",
  "country.RO": "Румъния",
  "country.GR": "Гърция",
  "country.PL": "Полша",

  // ---- /dev/typography (owner review of Cyrillic fallbacks, D-003) ----
  "dev.title": "Типография",
  "dev.intro":
    "Всеки текстов стил на български и английски. Кирилицата засега идва от временен системен шрифт (D-003).",
  "dev.sampleDisplay": "Новият албум е тук",
  "dev.sampleH2": "Събери цялата версия",
  "dev.sampleH3": "Класьор за фотокарти A5",
  "dev.sampleBody":
    "Доставяме от България до Румъния и Гърция. Цената, ДДС и доставката се виждат, преди да платиш.",
  "dev.sampleSmall": "Изпращане до 5 работни дни след сборната пратка.",
  "dev.sampleLabel": "Предзаказ · 04.12.2026",

  // ---- Admin (staff) ----
  "admin.title": "KUMMIE Admin",
  "admin.signIn": "Вход",
  "admin.email": "Имейл",
  "admin.password": "Парола",
  "admin.signInNote": "Само макет. Истинският вход с 2FA идва в M1 — тук нищо не се изпраща.",
  "admin.signOut": "Изход",
  "admin.dashboard": "Табло",
  "admin.orders": "Поръчки",
  "admin.batches": "Сборни поръчки",
  "admin.hub": "Пункт България",
  "admin.catalog": "Каталог",
  "admin.empty": "Още няма данни. Модулите идват в M1 и M2.",

  // ---- Mobile app ----
  "mobile.home": "Начало",
  "mobile.shop": "Магазин",
  "mobile.collection": "Колекция",
  "mobile.drops": "Drops",
  "mobile.chingu": "Chingu",
  "mobile.placeholder": "Този екран идва в M5. Засега е само брандирана рамка.",
  "mobile.homeLead": "Твоят K-pop чингу. Камбеци, колекция и дропове на едно място.",
} as const;
