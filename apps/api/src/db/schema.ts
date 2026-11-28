/**
 * Drizzle schema. Change it here, then `pnpm --filter api db:generate` writes the SQL migration into
 * ./drizzle. Never edit an applied migration; add a new one.
 *
 * Money is integer euro cents incl. VAT (D-025). Bilingual text is stored as `*_bg` / `*_en` columns
 * for single strings and as `{ bg, en }` JSON for lists.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  date,
  bigint,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

type Localized = { bg: string; en: string };

export const sourcingEnum = pgEnum("sourcing", [
  "OFFICIAL",
  "KUMMIE_ORIGINAL",
  "LICENSED",
  "SUPPLIER_DIRECT",
]);
/** LIMITED is deliberately absent: it comes only from `products.is_limited` (badges.json rules). */
export const productStateEnum = pgEnum("product_state", ["NEW_DROP", "IN_STOCK_EU", "PRE_ORDER"]);
export const productStatusEnum = pgEnum("product_status", ["draft", "published", "archived"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

// ---------- Catalogue reference data (seeded) ----------

/** Artist/group metadata only — no logos, photos or artwork (D-012). */
export const groups = pgTable(
  "groups",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    generation: integer("generation").notNull(),
    aka: text("aka"),
    /** True until an editor confirms the entry. */
    editorialCheck: boolean("editorial_check").notNull().default(true),
  },
  (t) => [check("groups_generation_range", sql`${t.generation} between 1 and 5`)],
);

export const categories = pgTable("categories", {
  id: text("id").primaryKey(),
  nameBg: text("name_bg").notNull(),
  nameEn: text("name_en").notNull(),
  position: integer("position").notNull(),
});

export const subcategories = pgTable(
  "subcategories",
  {
    id: text("id").primaryKey(),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id),
    nameBg: text("name_bg").notNull(),
    nameEn: text("name_en").notNull(),
    position: integer("position").notNull(),
  },
  (t) => [index("subcategories_category_idx").on(t.categoryId)],
);

// ---------- Products ----------

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** URL slug, e.g. "kum-binder". */
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    summaryBg: text("summary_bg").notNull().default(""),
    summaryEn: text("summary_en").notNull().default(""),
    subcategoryId: text("subcategory_id")
      .notNull()
      .references(() => subcategories.id),
    groupId: text("group_id").references(() => groups.id),
    sourcing: sourcingEnum("sourcing").notNull(),
    state: productStateEnum("state"),
    /** The ONLY thing that turns the UI pink. */
    isLimited: boolean("is_limited").notNull().default(false),
    status: productStatusEnum("status").notNull().default("draft"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    /** Sample data for testing; never real stock or authorisation. */
    isDemo: boolean("is_demo").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("products_slug_unique").on(t.slug),
    index("products_status_idx").on(t.status),
    index("products_subcategory_idx").on(t.subcategoryId),
    index("products_group_idx").on(t.groupId),
  ],
);

/** A sellable version of a product (album version, size…). */
export const variants = pgTable(
  "variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    version: text("version").notNull(),
    sku: text("sku").notNull(),
    /** Consumer price incl. VAT, the same in every country (D-025). */
    priceCents: integer("price_cents").notNull(),
    position: integer("position").notNull().default(0),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("variants_sku_unique").on(t.sku),
    index("variants_product_idx").on(t.productId),
    check("variants_price_positive", sql`${t.priceCents} > 0`),
  ],
);

/** Everything the product page must show under GPSR Art. 19. One row per product. */
export const productCompliance = pgTable("product_compliance", {
  productId: uuid("product_id")
    .primaryKey()
    .references(() => products.id, { onDelete: "cascade" }),
  dispatchEstimateBg: text("dispatch_estimate_bg"),
  dispatchEstimateEn: text("dispatch_estimate_en"),
  /** ISO country codes the product can be delivered to. */
  deliveryRegions: text("delivery_regions")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  manufacturer: text("manufacturer"),
  euResponsiblePerson: text("eu_responsible_person"),
  safetyInfo: jsonb("safety_info").$type<Localized | null>(),
  warnings: jsonb("warnings").$type<Localized[]>().notNull().default([]),
  /** Explicit "no specific safety information or warnings". */
  safetyNone: boolean("safety_none").notNull().default(false),
  returnExceptions: jsonb("return_exceptions").$type<Localized[]>().notNull().default([]),
  /** Explicit "no exceptions beyond the legal ones". */
  returnExceptionsNone: boolean("return_exceptions_none").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Product photos (never artist photos, logos or album art in our own assets). */
export const productImages = pgTable(
  "product_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    altBg: text("alt_bg").notNull().default(""),
    altEn: text("alt_en").notNull().default(""),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("product_images_product_idx").on(t.productId)],
);

/** Free-form search keywords per product (later: full-text search). */
export const productKeywords = pgTable(
  "product_keywords",
  {
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    keyword: text("keyword").notNull(),
  },
  (t) => [primaryKey({ columns: [t.productId, t.keyword] })],
);

// ---------- Staff, sessions, audit and settings ----------

export const staffRoleEnum = pgEnum("staff_role", ["admin", "hub", "content"]);

/** Internal users of the admin panel. 2FA (TOTP) is mandatory (ARCHITECTURE §8). */
export const staffUsers = pgTable(
  "staff_users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: staffRoleEnum("role").notNull(),
    /** argon2id hash. */
    passwordHash: text("password_hash").notNull(),
    /** TOTP secret, encrypted with STAFF_SECRET_KEY (AES-256-GCM). Null until enrolled. */
    totpSecretEnc: text("totp_secret_enc"),
    totpEnabled: boolean("totp_enabled").notNull().default(false),
    /** Last accepted TOTP time step, so a code can never be used twice. */
    totpLastStep: integer("totp_last_step"),
    active: boolean("active").notNull().default(true),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("staff_users_email_unique").on(sql`lower(${t.email})`)],
);

/** Server-side staff sessions; only the SHA-256 of the cookie token is stored. */
export const staffSessions = pgTable(
  "staff_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staffUsers.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    userAgent: text("user_agent"),
  },
  (t) => [index("staff_sessions_staff_idx").on(t.staffId)],
);

/** Append-only record of staff changes to products, orders, refunds, Kummies and settings. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    staffId: uuid("staff_id").references(() => staffUsers.id),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_log_entity_idx").on(t.entity, t.entityId), index("audit_log_at_idx").on(t.at)],
);

/** Key/value business settings edited in admin (company data, НАП numbers, OSS date, fees…). */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid("updated_by").references(() => staffUsers.id),
});

// ---------- Customers (M1 Task 4) ----------

export const accountLocaleEnum = pgEnum("account_locale", ["bg", "en"]);
export const shippingCountryEnum = pgEnum("shipping_country", ["BG", "RO", "GR"]);
export const customerTokenPurposeEnum = pgEnum("customer_token_purpose", ["verify_email", "reset_password"]);
export const consentKindEnum = pgEnum("consent_kind", [
  "terms",
  "notify_comebacks",
  "notify_restocks",
  "notify_order_status",
  "notify_club_drops",
  "personalised_ads",
]);

/**
 * One customer record for web and app. `deleted_at` closes the account at once (GDPR request);
 * `erased_at` is set when the background job has removed the personal data.
 */
export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    /** argon2id hash; empty after erasure. */
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull(),
    locale: accountLocaleEnum("locale").notNull().default("bg"),
    /** Age gate (A2). Under 18 is derived from it every time, so it changes on the birthday. */
    birthDate: date("birth_date", { mode: "string" }),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    erasedAt: timestamp("erased_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("customers_email_unique").on(sql`lower(${t.email})`)],
);

/** Server-side customer sessions; only the SHA-256 of the cookie token is stored. */
export const customerSessions = pgTable(
  "customer_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    userAgent: text("user_agent"),
  },
  (t) => [index("customer_sessions_customer_idx").on(t.customerId)],
);

/** Single-use links sent by e-mail (verify e-mail, reset password); only the SHA-256 is stored. */
export const customerTokens = pgTable(
  "customer_tokens",
  {
    tokenHash: text("token_hash").primaryKey(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    purpose: customerTokenPurposeEnum("purpose").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("customer_tokens_customer_idx").on(t.customerId, t.purpose)],
);

export const addresses = pgTable(
  "addresses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    line1: text("line1").notNull(),
    line2: text("line2"),
    city: text("city").notNull(),
    postcode: text("postcode").notNull(),
    country: shippingCountryEnum("country").notNull(),
    phone: text("phone").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    ...timestamps,
  },
  (t) => [index("addresses_customer_idx").on(t.customerId)],
);

/**
 * Append-only consent history (proof of consent, GDPR Art. 7): the latest row per kind is the
 * current choice. Kept after erasure — it holds no personal data besides the customer id.
 */
export const consents = pgTable(
  "consents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    kind: consentKindEnum("kind").notNull(),
    granted: boolean("granted").notNull(),
    /** Where it was given: "signup", "account", "system" (e.g. switched off for a minor). */
    source: text("source").notNull(),
    /** Version of the text agreed to (terms); null for simple switches. */
    version: text("version"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("consents_customer_kind_idx").on(t.customerId, t.kind, t.at)],
);

// ---------- Background jobs (outbox) ----------

export const jobStatusEnum = pgEnum("job_status", ["pending", "running", "done", "failed"]);

/**
 * Outbox for work done outside the request: e-mails now, notifications and erasure later.
 * Picked up right after the request and by the `tick` cron as the safety net (retries with backoff).
 */
export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    /** The same key is never queued twice (e.g. one confirmation e-mail per order). */
    idempotencyKey: text("idempotency_key").notNull(),
    status: jobStatusEnum("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    doneAt: timestamp("done_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("jobs_idempotency_unique").on(t.idempotencyKey),
    index("jobs_due_idx").on(t.status, t.runAt),
  ],
);

// ---------- Cart, orders, payments, Kummies (M1 Tasks 6–7) ----------

/** One open cart per customer, or per guest browser (cookie token, only its SHA-256 stored). */
export const carts = pgTable(
  "carts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "cascade" }),
    guestTokenHash: text("guest_token_hash"),
    country: shippingCountryEnum("country").notNull().default("BG"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("carts_customer_unique").on(t.customerId),
    uniqueIndex("carts_guest_unique").on(t.guestTokenHash),
  ],
);

export const cartLines = pgTable(
  "cart_lines",
  {
    cartId: uuid("cart_id")
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => variants.id, { onDelete: "cascade" }),
    qty: integer("qty").notNull(),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.cartId, t.variantId] }),
    check("cart_lines_qty", sql`${t.qty} between 1 and 20`),
  ],
);

export const orderStatusEnum = pgEnum("order_status", [
  "pending_payment",
  "paid",
  "batched",
  "ordered_from_supplier",
  "supplier_shipped",
  "received_at_hub",
  "packed",
  "handed_to_carrier",
  "out_for_delivery",
  "delivered",
  "cancelled",
  "refunded",
  "partially_refunded",
  "exception",
]);

type DeliveryAddressJson = {
  name: string;
  line1: string;
  line2: string | null;
  city: string;
  postcode: string;
  country: "BG" | "RO" | "GR";
  phone: string;
};
type InvoiceJson =
  | { kind: "person"; name: string; address: string }
  | { kind: "company"; name: string; eik: string; vatNumber: string | null; address: string };

/**
 * An order. Prices, the VAT rate and VAT amount are copied in when it is created and never
 * recalculated (frozen); `paid_at` is set only from the payment provider's webhook.
 */
export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Running number for people: KUM-1001, KUM-1002 … */
    seq: bigint("seq", { mode: "number" }).generatedAlwaysAsIdentity({ startWith: 1001 }),
    customerId: uuid("customer_id").references(() => customers.id),
    /**
     * Guests open their order with this key (in the e-mail link). Stored as is: it only shows this one
     * order, exactly like the e-mail that carries it, and the confirmation e-mail must include it.
     */
    accessKey: text("access_key"),
    cartId: uuid("cart_id"),
    email: text("email").notNull(),
    locale: accountLocaleEnum("locale").notNull(),
    status: orderStatusEnum("status").notNull().default("pending_payment"),
    country: shippingCountryEnum("country").notNull(),
    address: jsonb("address").$type<DeliveryAddressJson>().notNull(),
    invoice: jsonb("invoice").$type<InvoiceJson | null>(),
    goodsCents: integer("goods_cents").notNull(),
    shippingCents: integer("shipping_cents").notNull(),
    totalCents: integer("total_cents").notNull(),
    /** Country whose VAT applies (BG before the OSS date, A12) and its rate in basis points. */
    vatCountry: text("vat_country").notNull(),
    vatRateBp: integer("vat_rate_bp").notNull(),
    vatCents: integer("vat_cents").notNull(),
    shippingVatCents: integer("shipping_vat_cents").notNull(),
    kummies: integer("kummies").notNull(),
    termsVersion: text("terms_version").notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("orders_customer_idx").on(t.customerId, t.createdAt),
    index("orders_status_idx").on(t.status),
    check(
      "orders_total",
      sql`${t.totalCents} = ${t.goodsCents} + ${t.shippingCents} and ${t.totalCents} > 0`,
    ),
  ],
);

export const orderLines = pgTable(
  "order_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id").references(() => variants.id),
    productId: uuid("product_id").references(() => products.id),
    title: text("title").notNull(),
    version: text("version").notNull(),
    sku: text("sku").notNull(),
    sourcing: sourcingEnum("sourcing").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
    qty: integer("qty").notNull(),
    lineTotalCents: integer("line_total_cents").notNull(),
    /** This line's share of the order VAT (the shares add up exactly, D-016). */
    vatCents: integer("vat_cents").notNull(),
    dispatchEstimate: jsonb("dispatch_estimate").$type<Localized>().notNull(),
    position: integer("position").notNull(),
    /** Units refunded instead of shipped (missing or damaged, D-064); they are not packed. */
    refundedQty: integer("refunded_qty").notNull().default(0),
  },
  (t) => [index("order_lines_order_idx").on(t.orderId)],
);

/** Append-only order history: every status change and payment outcome. */
export const orderEvents = pgTable(
  "order_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    fromStatus: orderStatusEnum("from_status"),
    toStatus: orderStatusEnum("to_status"),
    /** "customer", "provider", "system" or "staff:<id>". */
    actor: text("actor").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("order_events_order_idx").on(t.orderId, t.at)],
);

export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "authorized",
  "captured",
  "failed",
  "cancelled",
  "refunded",
  "partially_refunded",
]);

/** One row per payment attempt (provider session). */
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    sessionId: text("session_id").notNull(),
    providerPaymentId: text("provider_payment_id"),
    /** From the bank on authorisation; printed on the Н-18 receipt and in the monthly XML. */
    authCode: text("auth_code"),
    terminalId: text("terminal_id"),
    transactionRef: text("transaction_ref"),
    amountCents: integer("amount_cents").notNull(),
    status: paymentStatusEnum("status").notNull().default("pending"),
    failureReason: text("failure_reason"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("payments_session_unique").on(t.provider, t.sessionId),
    index("payments_order_idx").on(t.orderId),
  ],
);

export const kummiesEntryEnum = pgEnum("kummies_entry", ["earn", "spend", "expire", "revoke", "adjust"]);

/**
 * Append-only Kummies ledger (D-027, D-031, D-032). Earn rows carry the validity window; the
 * balance and lots are worked out by `@kummie/core`. One earn per order.
 */
export const kummiesLedger = pgTable(
  "kummies_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    orderId: uuid("order_id").references(() => orders.id),
    kind: kummiesEntryEnum("kind").notNull(),
    /** Positive for earn/adjust up, negative for spend/expire/revoke. */
    amount: integer("amount").notNull(),
    earnedOn: date("earned_on", { mode: "string" }),
    validUntil: date("valid_until", { mode: "string" }),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("kummies_ledger_customer_idx").on(t.customerId),
    uniqueIndex("kummies_ledger_order_kind_unique").on(t.orderId, t.kind),
  ],
);

export const refundReasonEnum = pgEnum("refund_reason", [
  "shortage",
  "withdrawal",
  "cancelled",
  "damaged",
  "other",
]);
export const refundStatusEnum = pgEnum("refund_status", ["succeeded", "pending", "failed"]);

/**
 * Money returned to the customer through the provider. A full refund on cancellation now; partial
 * refunds per line (shortages, withdrawals) in M2. Sales documents (credit notes) point here (Task 9).
 */
export const refunds = pgTable(
  "refunds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payments.id),
    providerRefundId: text("provider_refund_id"),
    amountCents: integer("amount_cents").notNull(),
    reason: refundReasonEnum("reason").notNull(),
    status: refundStatusEnum("status").notNull(),
    /** "customer", "system" or "staff:<id>". */
    actor: text("actor").notNull(),
    /** Same key → the provider refunds once, even when we retry. */
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("refunds_order_idx").on(t.orderId),
    uniqueIndex("refunds_idempotency_unique").on(t.idempotencyKey),
    check("refunds_amount", sql`${t.amountCents} > 0`),
  ],
);

// ---------- Sales documents (Н-18 чл. 52о, ЗДДС) — M1 Task 9 ----------

export const documentKindEnum = pgEnum("document_kind", [
  "receipt",
  "receipt_storno",
  "invoice",
  "credit_note",
]);

/**
 * Gapless numbering per series: "receipt" (чл. 52о documents and their storno) and "invoice"
 * (invoices and credit notes share one series, ЗДДС). The row is locked by the UPDATE inside the
 * transaction that issues the document, so two payments never get the same number, and a rolled
 * back transaction gives its number back.
 */
export const documentSequences = pgTable("document_sequences", {
  series: text("series").primaryKey(),
  lastNumber: bigint("last_number", { mode: "number" }).notNull().default(0),
  /**
   * Range set by the accountant before the first document (D-067), so the platform never shares a
   * number with the accounting program. Null: from 1 to 9 999 999 999. Locked once a document exists.
   */
  firstNumber: bigint("first_number", { mode: "number" }),
  endNumber: bigint("end_number", { mode: "number" }),
});

export type DocumentSnapshot = {
  seller: {
    legalName: string | null;
    eik: string | null;
    vatNumber: string | null;
    address: string | null;
    email: string | null;
    eShopNumber: string | null;
  };
  buyer: {
    kind: "person" | "company";
    name: string;
    address: string;
    eik?: string;
    vatNumber?: string | null;
  } | null;
  lines: { name: string; qty: number; unitPriceCents: number; totalCents: number; vatCents: number }[];
  payment: {
    method: string;
    terminalId: string | null;
    authCode: string | null;
    transactionRef: string | null;
  };
  qr: string | null;
  orderNumber: string;
  orderDate: string;
  vatCountry: string;
  /** Number of the document this one corrects (storno / credit note). */
  refersToNumber: string | null;
  /** Sale day when an invoice is issued later than the sale (D-067); otherwise the issue day. */
  taxEventDate?: string | null;
  /** Why the money went back (credit notes and storno for missing or damaged units, D-064). */
  reason?: string | null;
};

/**
 * Issued sales documents. Amounts are frozen copies (negative for storno and credit notes); the
 * snapshot holds the seller, buyer, lines and payment as printed, so a PDF can be reproduced
 * exactly at any time even if company data or products change later.
 */
export const salesDocuments = pgTable(
  "sales_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    kind: documentKindEnum("kind").notNull(),
    series: text("series").notNull(),
    number: bigint("number", { mode: "number" }).notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    /** Storno → original receipt; credit note → original invoice. */
    refersToId: uuid("refers_to_id"),
    refundId: uuid("refund_id").references(() => refunds.id),
    totalCents: integer("total_cents").notNull(),
    vatCents: integer("vat_cents").notNull(),
    vatRateBp: integer("vat_rate_bp").notNull(),
    snapshot: jsonb("snapshot").$type<DocumentSnapshot>().notNull(),
  },
  (t) => [
    uniqueIndex("sales_documents_number_unique").on(t.series, t.number),
    uniqueIndex("sales_documents_order_kind_unique")
      .on(t.orderId, t.kind)
      .where(sql`${t.kind} in ('receipt', 'invoice')`),
    index("sales_documents_order_idx").on(t.orderId),
    index("sales_documents_issued_idx").on(t.issuedAt),
  ],
);

// ---------------------------------------------------------------------------------------------
// M2 operations: supplier batches, the Bulgaria hub and parcels (docs/specs/M2-operations.md)
// ---------------------------------------------------------------------------------------------

const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({
  dataType: () => "bytea",
  toDriver: (value) => Buffer.from(value),
  fromDriver: (value) => new Uint8Array(value),
});

/** Who we buy from. Purchase orders go out on the supplier's schedule (B1, B2). */
export const suppliers = pgTable("suppliers", {
  /** Short code, e.g. "kmoon". */
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** Where purchase orders are e-mailed (the test supplier writes files instead). */
  orderEmail: text("order_email"),
  /** ISO weekdays (1 = Monday) on which the batch closes, Sofia time (D-063: Mon and Thu 08:30). */
  closeWeekdays: integer("close_weekdays")
    .array()
    .notNull()
    .default(sql`'{1,4}'`),
  closeHour: integer("close_hour").notNull().default(8),
  closeMinute: integer("close_minute").notNull().default(30),
  /** Minimum purchase order value in cents (0 = none, B2). */
  minOrderCents: integer("min_order_cents").notNull().default(0),
  /** Delivered Duty Paid (non-EU suppliers that offer it). */
  ddp: boolean("ddp").notNull().default(false),
  /** Ships from inside the EU (no customs). EU suppliers win over non-EU ones (D-063, B3). */
  inEu: boolean("in_eu").notNull().default(true),
  /**
   * Purchase orders go out by themselves (adapter). Off (D-063, Q39): the closed batch waits until
   * staff download the file, send it and mark the batch as ordered.
   */
  autoSend: boolean("auto_send").notNull().default(false),
  active: boolean("active").notNull().default(true),
  ...timestamps,
});

/** A supplier's offer for one of our variants: their SKU and our cost (B3). */
export const supplierOffers = pgTable(
  "supplier_offers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => variants.id, { onDelete: "cascade" }),
    supplierId: text("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    supplierSku: text("supplier_sku").notNull(),
    unitCostCents: integer("unit_cost_cents").notNull(),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("supplier_offers_variant_supplier_unique").on(t.variantId, t.supplierId),
    index("supplier_offers_variant_idx").on(t.variantId),
    check("supplier_offers_cost_positive", sql`${t.unitCostCents} > 0`),
  ],
);

export const batchStatusEnum = pgEnum("batch_status", ["open", "closed", "ordered", "shipped", "received"]);

/** One consolidated purchase order to a supplier. At most one open batch per supplier. */
export const batches = pgTable(
  "batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seq: bigint("seq", { mode: "number" }).generatedAlwaysAsIdentity({ startWith: 1 }),
    supplierId: text("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    status: batchStatusEnum("status").notNull().default("open"),
    closesAt: timestamp("closes_at", { withTimezone: true }).notNull(),
    /** How often the closing was postponed for the minimum order value (B2). */
    postponed: integer("postponed").notNull().default(0),
    /** The batch's first closing time: the minimum order wait counts from here (D-063, B2). */
    firstClosesAt: timestamp("first_closes_at", { withTimezone: true }),
    /** "PO-2026-0001", set when the batch closes. */
    poReference: text("po_reference"),
    supplierReference: text("supplier_reference"),
    supplierTracking: text("supplier_tracking"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    orderedAt: timestamp("ordered_at", { withTimezone: true }),
    shippedAt: timestamp("shipped_at", { withTimezone: true }),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    /** Shipping, duty and handling of the whole batch (landed cost, cents). */
    extraCostCents: integer("extra_cost_cents").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("batches_one_open_per_supplier")
      .on(t.supplierId)
      .where(sql`${t.status} = 'open'`),
    uniqueIndex("batches_po_reference_unique").on(t.poReference),
    index("batches_status_idx").on(t.status),
  ],
);

/** One customer order line inside a batch. */
export const batchLines = pgTable(
  "batch_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => batches.id),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    orderLineId: uuid("order_line_id")
      .notNull()
      .references(() => orderLines.id),
    supplierSku: text("supplier_sku").notNull(),
    description: text("description").notNull(),
    qty: integer("qty").notNull(),
    unitCostCents: integer("unit_cost_cents").notNull(),
    /** Units counted at the hub. */
    receivedQty: integer("received_qty").notNull().default(0),
  },
  (t) => [
    uniqueIndex("batch_lines_order_line_unique").on(t.orderLineId),
    index("batch_lines_batch_idx").on(t.batchId),
    index("batch_lines_order_idx").on(t.orderId),
  ],
);

/**
 * Units of one supplier SKU that arrived damaged (D-063 B5), entered while receiving. The good
 * units are counted as received; these become "damaged" shortages when receiving is done. The
 * photo is for the claim to the supplier (re-encoded, no metadata, staff only).
 */
export const batchDamage = pgTable(
  "batch_damage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => batches.id),
    supplierSku: text("supplier_sku").notNull(),
    qty: integer("qty").notNull(),
    note: text("note"),
    photo: bytea("photo"),
    createdBy: uuid("created_by"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("batch_damage_batch_sku_unique").on(t.batchId, t.supplierSku),
    check("batch_damage_qty", sql`${t.qty} > 0`),
  ],
);

export const shortageKindEnum = pgEnum("shortage_kind", ["missing", "damaged"]);
export const shortageStatusEnum = pgEnum("shortage_status", ["open", "arrived", "refunded"]);

/**
 * Units an order line did not get at receiving (D-063 B5, D-064). Open until the supplier sends
 * them ("arrived") or staff confirm the partial refund ("refunded") after the 3 working days.
 */
export const shortages = pgTable(
  "shortages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => batches.id),
    batchLineId: uuid("batch_line_id")
      .notNull()
      .references(() => batchLines.id),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    orderLineId: uuid("order_line_id")
      .notNull()
      .references(() => orderLines.id),
    damageId: uuid("damage_id").references(() => batchDamage.id),
    kind: shortageKindEnum("kind").notNull(),
    qty: integer("qty").notNull(),
    /** The supplier's last working day to send the units (Sofia date). */
    dueOn: date("due_on", { mode: "string" }).notNull(),
    status: shortageStatusEnum("status").notNull().default("open"),
    claimSentAt: timestamp("claim_sent_at", { withTimezone: true }),
    refundId: uuid("refund_id").references(() => refunds.id),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: text("resolved_by"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("shortages_line_kind_unique").on(t.batchLineId, t.kind),
    index("shortages_status_idx").on(t.status),
    index("shortages_order_idx").on(t.orderId),
    check("shortages_qty", sql`${t.qty} > 0`),
  ],
);

export const complaintDemandEnum = pgEnum("complaint_demand", [
  "repair",
  "replacement",
  "price_reduction",
  "refund",
]);
export const complaintStatusEnum = pgEnum("complaint_status", ["open", "resolved", "rejected"]);
export const complaintChannelEnum = pgEnum("complaint_channel", ["site", "email", "phone", "in_person"]);

/**
 * Complaints register (ЗЗП чл. 127, D-069): one number sequence (RK-0001), the day received, the
 * one-month deadline, what the customer asks for and the outcome. Rows are never deleted.
 */
export const complaints = pgTable(
  "complaints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seq: bigint("seq", { mode: "number" }).generatedAlwaysAsIdentity({ startWith: 1 }),
    orderId: uuid("order_id").references(() => orders.id),
    orderLineId: uuid("order_line_id").references(() => orderLines.id),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    product: text("product").notNull(),
    description: text("description").notNull(),
    demand: complaintDemandEnum("demand").notNull(),
    channel: complaintChannelEnum("channel").notNull(),
    locale: text("locale").$type<"bg" | "en">().notNull().default("bg"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    dueOn: date("due_on", { mode: "string" }).notNull(),
    status: complaintStatusEnum("status").notNull().default("open"),
    outcome: text("outcome"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    /** "customer" or "staff:<id>". */
    createdBy: text("created_by").notNull(),
    resolvedBy: text("resolved_by"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("complaints_seq_unique").on(t.seq),
    index("complaints_status_idx").on(t.status, t.dueOn),
    index("complaints_order_idx").on(t.orderId),
  ],
);

export const returnStatusEnum = pgEnum("return_status", ["requested", "received", "refunded", "rejected"]);
export const returnCourierEnum = pgEnum("return_courier", ["speedy", "econt", "boxnow"]);
export const returnDecisionEnum = pgEnum("return_decision", ["pending", "accepted", "refused"]);
export const returnDispositionEnum = pgEnum("return_disposition", ["to_supplier", "keep"]);

/**
 * Withdrawal within 14 days of delivery (ЗЗП чл. 50, D-064, D-070): the customer picks the units
 * and the courier and sends them to the hub at their own cost; staff check each line when the
 * parcel arrives; an admin confirms the refund. Own number sequence (RET-0001).
 */
export const returns = pgTable(
  "returns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seq: bigint("seq", { mode: "number" }).generatedAlwaysAsIdentity({ startWith: 1 }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    status: returnStatusEnum("status").notNull().default("requested"),
    courier: returnCourierEnum("courier").notNull(),
    /** Optional — the customer need not give a reason. */
    reason: text("reason"),
    /** The money must be back within 14 days of the request (ЗЗП чл. 55). */
    refundDueOn: date("refund_due_on", { mode: "string" }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedBy: text("closed_by"),
    refundId: uuid("refund_id").references(() => refunds.id),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("returns_seq_unique").on(t.seq),
    index("returns_order_idx").on(t.orderId),
    index("returns_status_idx").on(t.status),
  ],
);

export const returnLines = pgTable(
  "return_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    returnId: uuid("return_id")
      .notNull()
      .references(() => returns.id, { onDelete: "cascade" }),
    orderLineId: uuid("order_line_id")
      .notNull()
      .references(() => orderLines.id),
    qty: integer("qty").notNull(),
    decision: returnDecisionEnum("decision").notNull().default("pending"),
    /** Why a line was refused (e.g. a sealed album opened, ЗЗП чл. 57). */
    refuseReason: text("refuse_reason"),
    /** What happens to the goods: back to the supplier or kept (D-064). */
    disposition: returnDispositionEnum("disposition"),
  },
  (t) => [
    uniqueIndex("return_lines_return_line_unique").on(t.returnId, t.orderLineId),
    check("return_lines_qty", sql`${t.qty} > 0`),
  ],
);

export const parcelStatusEnum = pgEnum("parcel_status", [
  "labelled",
  "handed_over",
  "out_for_delivery",
  "delivered",
  "exception",
  "cancelled",
]);

/** A parcel to the customer, created at the hub when the order is packed. */
export const parcels = pgTable(
  "parcels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    carrier: text("carrier").notNull(),
    trackingNumber: text("tracking_number").notNull(),
    labelPdf: bytea("label_pdf").notNull(),
    weightGrams: integer("weight_grams").notNull(),
    status: parcelStatusEnum("status").notNull().default("labelled"),
    handedOverAt: timestamp("handed_over_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    lastTrackedAt: timestamp("last_tracked_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("parcels_tracking_unique").on(t.carrier, t.trackingNumber),
    index("parcels_order_idx").on(t.orderId),
    index("parcels_status_idx").on(t.status),
  ],
);
