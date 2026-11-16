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
  date,
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
