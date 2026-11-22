import { z } from "zod";
import { Country, Localized, Sourcing } from "./catalogue";

// ---------- Staff authentication (password + mandatory TOTP 2FA) ----------

export const StaffRole = z.enum(["admin", "hub", "content"]);
export type StaffRole = z.infer<typeof StaffRole>;

export const Staff = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  role: StaffRole,
});
export type Staff = z.infer<typeof Staff>;

export const LoginRequest = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(200),
});

/** After the password: either enter the 6-digit code, or set up 2FA first (first login). */
export const LoginResponse = z.discriminatedUnion("step", [
  z.object({ step: z.literal("totp"), challenge: z.string() }),
  z.object({ step: z.literal("enroll"), challenge: z.string(), secret: z.string(), otpauthUrl: z.string() }),
]);
export type LoginResponse = z.infer<typeof LoginResponse>;

export const TotpRequest = z.object({
  challenge: z.string().min(10),
  code: z.string().regex(/^\d{6}$/),
});

export const OkResponse = z.object({ ok: z.literal(true) });

// ---------- Company settings (A4, A5, A12, A15) ----------

const optionalText = z.string().trim().max(300).nullable();

export const CompanySettings = z.object({
  legalName: optionalText,
  eik: z
    .string()
    .trim()
    .regex(/^\d{9}(\d{4})?$/, "ЕИК has 9 or 13 digits")
    .nullable(),
  vatNumber: z
    .string()
    .trim()
    .regex(/^BG\d{9,10}$/, "VAT number looks like BG123456789")
    .nullable(),
  registeredAddress: optionalText,
  contactEmail: z.string().trim().email().nullable(),
  contactPhone: optionalText,
  iban: z
    .string()
    .trim()
    .regex(/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/, "IBAN without spaces")
    .nullable(),
  /** Default EU responsible person for KUMMIE Originals (GPSR). */
  euResponsiblePerson: optionalText,
  /** ISO date the voluntary OSS registration takes effect (A12). */
  ossEffectiveFrom: z.iso.date().nullable(),
  /** НАП e-shop registration (Приложение № 33): RF number shown in receipt QR codes. */
  napRfNumber: optionalText,
  /** НАП unique e-shop number used in the monthly audit XML. */
  napEShopNumber: optionalText,
  napRegisteredOn: z.iso.date().nullable(),
  /** Delivery fee per country in cents incl. VAT (A5). */
  deliveryFeesCents: z.object({
    BG: z.number().int().min(0),
    RO: z.number().int().min(0),
    GR: z.number().int().min(0),
  }),
});
export type CompanySettings = z.infer<typeof CompanySettings>;

export const EMPTY_COMPANY_SETTINGS: CompanySettings = {
  legalName: null,
  eik: null,
  vatNumber: null,
  registeredAddress: null,
  contactEmail: null,
  contactPhone: null,
  iban: null,
  euResponsiblePerson: null,
  ossEffectiveFrom: null,
  napRfNumber: null,
  napEShopNumber: null,
  napRegisteredOn: null,
  deliveryFeesCents: { BG: 490, RO: 490, GR: 490 },
};

// ---------- Products in admin ----------

export const ProductStatus = z.enum(["draft", "published", "archived"]);
export const EditableState = z.enum(["NEW_DROP", "IN_STOCK_EU", "PRE_ORDER"]);
export const ComplianceField = z.enum([
  "title",
  "sourcing",
  "version",
  "price",
  "dispatchEstimate",
  "deliveryRegions",
  "manufacturer",
  "euResponsiblePerson",
  "safety",
  "returnExceptions",
]);

export const AdminVariant = z.object({
  id: z.string().optional(),
  version: z.string().trim().max(200),
  sku: z
    .string()
    .trim()
    .regex(/^[A-Z0-9-]{2,40}$/, "SKU: capital letters, digits and dashes"),
  priceCents: z.number().int().min(0),
  active: z.boolean(),
});

export const AdminCompliance = z.object({
  dispatchEstimate: Localized,
  deliveryRegions: z.array(Country),
  manufacturer: z.string().trim().max(300),
  euResponsiblePerson: z.string().trim().max(300),
  safetyInfo: Localized.nullable(),
  warnings: z.array(Localized),
  safetyNone: z.boolean(),
  returnExceptions: z.array(Localized),
  returnExceptionsNone: z.boolean(),
});

/** What staff can edit. A draft may be incomplete; only publishing runs the GPSR gate. */
export const ProductInput = z.object({
  slug: z.string().regex(/^[a-z0-9-]{2,80}$/, "slug: lower-case letters, digits and dashes"),
  title: z.string().trim().max(200),
  summary: Localized,
  subcategoryId: z.string().min(1),
  groupId: z.string().nullable(),
  sourcing: Sourcing,
  state: EditableState.nullable(),
  isLimited: z.boolean(),
  variants: z.array(AdminVariant).max(50),
  compliance: AdminCompliance,
});
export type ProductInput = z.infer<typeof ProductInput>;

export const AdminProduct = ProductInput.extend({
  id: z.string(),
  status: ProductStatus,
  isDemo: z.boolean(),
  updatedAt: z.string(),
  /** What still blocks publishing (empty = can be published). */
  missing: z.array(ComplianceField),
});
export type AdminProduct = z.infer<typeof AdminProduct>;

export const AdminProductSummary = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  status: ProductStatus,
  sourcing: Sourcing,
  isDemo: z.boolean(),
  priceCents: z.number().int().nullable(),
  missingCount: z.number().int().nonnegative(),
  updatedAt: z.string(),
});
export const AdminProductList = z.object({ items: z.array(AdminProductSummary) });

export const AdminProductListQuery = z.object({
  q: z.string().trim().max(100).optional(),
  status: ProductStatus.optional(),
});

export const IdParams = z.object({ id: z.string().uuid() });

export const PublishBlocked = z.object({
  error: z.literal("publish_blocked"),
  message: z.string(),
  missing: z.array(ComplianceField),
});

// ---------- Product import from a file (CSV template) ----------

export const ProductImportRequest = z.object({
  /** The CSV text (UTF-8; the admin decodes windows-1251 files from Excel before sending). */
  csv: z.string().min(1).max(5_000_000),
  /** true: only check and report; false: import everything or nothing. */
  dryRun: z.boolean(),
});

export const ImportIssueCode = z.enum([
  "missing_column",
  "unknown_column",
  "required",
  "invalid_value",
  "bad_slug",
  "bad_sku",
  "bad_price",
  "unknown_subcategory",
  "unknown_group",
  "unknown_region",
  "duplicate_sku",
  "sku_of_other_product",
  "conflicting_value",
  "missing_translation",
  "too_many_rows",
  "empty_file",
]);
export type ImportIssueCode = z.infer<typeof ImportIssueCode>;

export const ImportIssue = z.object({
  /** Line in the file (1 = header). */
  line: z.number().int(),
  column: z.string().nullable(),
  code: ImportIssueCode,
  value: z.string().nullable(),
});
export type ImportIssue = z.infer<typeof ImportIssue>;

export const ProductImportReport = z.object({
  applied: z.boolean(),
  products: z.array(
    z.object({
      slug: z.string(),
      title: z.string(),
      action: z.enum(["create", "update"]),
      variants: z.number().int(),
      /** The file asked to publish it. */
      publish: z.boolean(),
      /** GPSR fields still missing: the product stays a draft until they are filled. */
      missing: z.array(ComplianceField),
      status: z.enum(["draft", "published", "archived"]).nullable(),
    }),
  ),
  issues: z.array(ImportIssue),
});
export type ProductImportReport = z.infer<typeof ProductImportReport>;
