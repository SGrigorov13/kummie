import type { Messages } from "./types";

/** English copy — must have exactly the keys of `bg.ts`. */
export const en: Messages = {
  // ---- Navigation and shell ----
  shop: "Shop",
  collect: "Collect",
  magazine: "Magazine",
  teen: "Teen",
  club: "Club",
  groups: "Groups",
  calendar: "Calendar",
  chingu: "Ask KUMMIE",
  search: "Search",
  searchPh: "Group, album, binder",
  searchSubmit: "Search",
  cart: "Cart",
  cartCount: "Cart, items: {count}",
  account: "Account",
  lang: "Language",
  langSwitch: "Български",
  skipToContent: "Skip to content",
  mainNav: "Main navigation",
  homeLink: "KUMMIE — home",
  close: "Close",
  back: "Back",
  open: "Open",

  // ---- Promo bar (D-007). Never rendered on Teen routes. ----
  promoBar: "ORDER NOW * 1 KUMMIE FOR EVERY €1 ON ORDERS FROM €30 * FREE DELIVERY OVER €79.99",
  promoRegion: "Promotion",
  dismiss: "Dismiss the promotion",

  // ---- Footer ----
  footerTagline: "Your K-pop Chingu. Discover. Collect. Connect.",
  footerLegal: "Legal information",
  rights: "Demo interface. Not a shop and not legal advice.",
  withdrawal: "14-day withdrawal",
  returns: "Returns",
  guarantee: "2-year guarantee",
  privacy: "Privacy",
  terms: "Terms",
  complaints: "Complaints",

  // ---- Cookie banner ----
  cookieTitle: "Cookies",
  cookie: "We only use what this test needs to work. There is no analytics and no advertising.",
  cookieOk: "Essential only",

  // ---- Home ----
  heroKicker: "Your K-pop Chingu",
  heroTitle: "Discover. Collect. Connect.",
  heroBody:
    "A European place for K-pop, starting from Bulgaria. This screen is a demo with sample items, no warehouse and no payment.",
  heroCta: "Browse the shop",
  heroAlt: "How to start a collection",
  categoriesTitle: "Categories",
  picks: "KUMMIE Picks",
  bundleHint: "A starter set for cards: sleeves, a binder, and toploaders.",
  magazineLead: "Useful reading, not news about us.",
  guide: "Guide",
  clubLead: "Get 1 Kummie for every euro on orders of €30 or more.",
  kummiesLeft: "{amount} more and you start collecting Kummies.",
  clubCta: "See the club",

  // ---- Shop ----
  all: "All",
  category: "Category",
  subcategory: "Subcategory",
  gen: "Generation",
  genN: "Generation {n}",
  results: "Items: {count}",
  none: "No matches.",
  notFound: "This page does not exist.",

  // ---- Product ----
  demo: "Sample item. No real stock.",
  add: "Add to cart",
  added: "Added",
  wishlist: "Wishlist",
  owned: "I own this",
  vat: "incl. VAT",
  priceNote: "One price for Bulgaria, Romania and Greece.",
  facts: "Product information",
  version: "Version",
  sourcing: "Sourcing",
  dispatch: "Dispatch",
  regions: "Delivers to",
  maker: "Manufacturer",
  responsible: "EU responsible person",
  safety: "Safety",
  warnings: "Warnings",
  noWarnings: "No specific warnings.",
  returnsNote: "Return exceptions",
  noReturnExceptions: "No exceptions beyond the legal ones. You have 14 days to withdraw after delivery.",
  group: "Group",
  limited: "Limited",
  status: "Status",
  explore: "More from KUMMIE",
  "sourcing.OFFICIAL": "Authentic product from a documented source.",
  "sourcing.KUMMIE_ORIGINAL": "Own-brand product in an original design, with no third-party IP.",
  "sourcing.LICENSED": "Third-party IP used under a documented licence.",
  "sourcing.SUPPLIER_DIRECT": "Ships from the supplier, not from EU stock.",

  // ---- Cart and demo checkout ----
  checkout: "To the demo checkout",
  demoNotice: "Demo checkout: nothing is charged and the order stays on this device only.",
  subtotal: "Items",
  vatLine: "incl. VAT {rate}%",
  shipping: "Shipping",
  shippingFree: "Free",
  freeShip: "Delivery is on us for orders from €80.",
  freeShipLeft: "Add {amount} more and delivery is on us.",
  freeShipReached: "Lovely — delivery is on us!",
  deliveryWindow: "Delivery window: per each item's dispatch date. No customs or hidden fees.",
  credit: "Kummies discount",
  total: "Total",
  points: "Kummies from this order",
  place: "Confirm demo order",
  name: "Name",
  city: "City",
  address: "Address",
  country: "Country",
  required: "Please fill in this field.",
  empty: "The cart is empty.",
  qty: "Qty",
  remove: "Remove",

  // ---- Orders ----
  order: "Order",
  orders: "Orders",
  advance: "Simulate the next step",
  localNote: "The status changes only here, so you can see the batch-shipment path.",
  noOrders: "No demo order yet.",
  stepOf: "Step {n} of 7",
  "step.confirmed": "Order confirmed",
  "step.batch": "Included in the batch order",
  "step.dispatched": "Grouped shipment dispatched",
  "step.hub": "Arrived at the Bulgaria hub",
  "step.carrier": "Handed to the carrier",
  "step.out_for_delivery": "Out for delivery",
  "step.delivered": "Delivered",
  "status.pending_payment": "Waiting for payment.",
  "status.cancelled": "The order was cancelled. If you paid, the money goes back the same way.",
  "status.refunded": "The full amount was refunded.",
  "status.partially_refunded": "Part of the amount was refunded for an item we cannot deliver.",
  "status.exception": "There is a problem with part of the order. We will write to you with the options.",

  // ---- Collection ----
  homeCollect: "Your collection",
  emptyCollect: "Mark “I own this” or “Wishlist” on an item.",
  saved: "Saved on this device only.",

  // ---- Club ----
  kummies: "Kummies",
  redeem: "Redeem {cost} Kummies for {amount} off",
  history: "History",
  ageTitle: "Before the club and the tombola",
  ageUnder: "Under 18",
  ageOver: "18 or over",
  ageNote:
    "Under 18 there is no tombola without a parent's consent and no public profile. There is no personalised advertising either.",
  tombola: "Tombola",
  tombolaBody:
    "This local test has no draw and no prize. A real campaign would publish the rules and the odds first, and anyone under 18 would need a parent's consent.",
  redeemNote: "Redeemed for {amount} off",
  earnNote: "From order {id} · valid until {date}",
  kummiesExpiring: "Use your {count} Kummies by {date} — after that they expire and the discount is gone.",
  kummiesValidity: "Kummies are valid for {days} days from the day the order is paid.",
  // Expiry reminders (D-031): push ≤ 60 characters, e-mail subject + body. Sent 14, 3 and 1 day before.
  "kummies.reminder14": "⭐ {count} Kummies expire in 14 days — treat yourself",
  "kummies.reminder3": "⭐ {count} Kummies expire in 3 days — don't lose them",
  "kummies.reminder1": "⭐ {count} Kummies expire tomorrow — use them today",
  "kummies.reminderEmail":
    "Hi! You have {count} Kummies worth {amount} off at KUMMIE. They are valid until {date} and disappear after that. We would love to see you use them on something nice.",

  // ---- Account and notifications ----
  alerts: "Notifications",
  comebacks: "Comebacks",
  restocks: "Restocks",
  orderAlerts: "Order status",
  orderAlertsNote: "Order status is a service message and is never bundled with marketing.",
  drops: "Club drops",
  quiet: "Quiet hours 22:00–08:00. At most two marketing notifications a week. This demo sends no real push.",
  reset: "Clear local data",

  // ---- Groups and calendar ----
  follow: "Follow",
  following: "Following",
  editorialCheck: "Awaiting editorial check",
  calendarNote: "Sample dates. Not an official schedule.",

  // ---- Ask KUMMIE ----
  askPh: "For example: what can I buy with €40",
  ask: "Ask",
  askLabel: "Recommendation",
  askIntro: "Answers are recommendations. I do not show stock and do not invent dates.",

  // ---- Teen ----
  teenNote: "K-pop from a young fan's perspective. No comments, no profiles, and no personal name.",

  // ---- Legal pages (prototype text until the real terms are written) ----
  "legal.withdrawal":
    "A real EU sale gives you 14 days to withdraw after delivery, with the legal exceptions. There is no contract here.",
  "legal.returns": "A demo return sends nothing. The real process is written before the first sale.",
  "legal.guarantee":
    "Consumer goods in the EU carry at least a two-year legal guarantee. This text is not a warranty card.",
  "legal.privacy":
    "The demo keeps the cart, wishlist, and orders in this browser's localStorage. There is no server, no ad cookie, and no profile of the young contributor behind KUMMIE Teen.",
  "legal.terms":
    "This is a local prototype for review. The order button takes no money and creates no obligation.",
  "legal.complaints":
    "A complaint about a real seller goes to that seller and, if needed, to the authority. There is no seller here.",

  // ---- Countries ----
  "country.BG": "Bulgaria",
  "country.RO": "Romania",
  "country.GR": "Greece",
  "country.PL": "Poland",

  // ---- /dev/typography (owner review of Cyrillic fallbacks, D-003) ----
  "dev.title": "Typography",
  "dev.intro":
    "Every text style in Bulgarian and English. Cyrillic currently comes from a temporary system font (D-003).",
  "dev.sampleDisplay": "The new album is here",
  "dev.sampleH2": "Collect the whole version",
  "dev.sampleH3": "A5 photocard binder",
  "dev.sampleBody":
    "We deliver from Bulgaria to Romania and Greece. Price, VAT and shipping are visible before you pay.",
  "dev.sampleSmall": "Dispatch within 5 working days after the consolidated shipment.",
  "dev.sampleLabel": "Pre-order · 04.12.2026",

  // ---- Admin (staff) ----
  "admin.title": "KUMMIE Admin",
  "admin.signIn": "Sign in",
  "admin.email": "Email",
  "admin.password": "Password",
  "admin.signInNote": "Placeholder only. Real sign-in with 2FA comes in M1 — nothing is sent from here.",
  "admin.signOut": "Sign out",
  "admin.dashboard": "Dashboard",
  "admin.orders": "Orders",
  "admin.batches": "Batches",
  "admin.hub": "Bulgaria hub",
  "admin.catalog": "Catalogue",
  "admin.empty": "No data yet. The modules arrive in M1 and M2.",

  // ---- Mobile app ----
  "mobile.home": "Home",
  "mobile.shop": "Shop",
  "mobile.collection": "Collection",
  "mobile.drops": "Drops",
  "mobile.chingu": "Chingu",
  "mobile.placeholder": "This screen arrives in M5. For now it is only the branded frame.",
  "mobile.homeLead": "Your K-pop chingu. Comebacks, collection and drops in one place.",
};
