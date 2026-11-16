import { z } from "zod";

// ---------- Customer accounts (M1 Task 4) ----------

export const AccountLocale = z.enum(["bg", "en"]);
/** Countries we deliver to at launch (Poland follows ~1 month later). */
export const ShippingCountry = z.enum(["BG", "RO", "GR"]);
export type ShippingCountry = z.infer<typeof ShippingCountry>;

const email = z.string().trim().toLowerCase().email().max(200);
/** Customers: at least 10 characters, no composition rules (NIST 800-63B). */
export const CustomerPassword = z.string().min(10).max(200);
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const SignUpRequest = z.object({
  email,
  password: CustomerPassword,
  name: z.string().trim().min(1).max(80),
  /** Age gate (A2): the date of birth decides whether the account is allowed and restricted. */
  birthDate: isoDay,
  locale: AccountLocale,
  /** Terms and the withdrawal information must be accepted to open an account. */
  acceptTerms: z.literal(true),
});
export type SignUpRequest = z.infer<typeof SignUpRequest>;

/** Sign-up never says whether the e-mail already exists: the next step is always "check your e-mail". */
export const SignUpResponse = z.object({ status: z.literal("check_email") });

export const SignInRequest = z.object({ email, password: z.string().min(1).max(200) });
export const EmailRequest = z.object({ email, locale: AccountLocale.optional() });
export const TokenRequest = z.object({ token: z.string().min(20).max(200) });
export const ResetPasswordRequest = z.object({
  token: z.string().min(20).max(200),
  password: CustomerPassword,
});

export const Account = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  locale: AccountLocale,
  birthDate: isoDay,
  /** Under 18 today: no personalised advertising, no public profile, no tombola without consent. */
  minor: z.boolean(),
  createdAt: z.string(),
});
export type Account = z.infer<typeof Account>;

export const ProfileUpdate = z.object({
  name: z.string().trim().min(1).max(80),
  locale: AccountLocale,
});
export type ProfileUpdate = z.infer<typeof ProfileUpdate>;

export const AddressInput = z.object({
  name: z.string().trim().min(1).max(120),
  line1: z.string().trim().min(1).max(200),
  line2: z.string().trim().max(200).nullable(),
  city: z.string().trim().min(1).max(100),
  postcode: z.string().trim().min(3).max(12),
  country: ShippingCountry,
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ()-]{6,20}$/),
  isDefault: z.boolean(),
});
export type AddressInput = z.infer<typeof AddressInput>;

export const Address = AddressInput.extend({ id: z.string() });
export type Address = z.infer<typeof Address>;
export const AddressList = z.object({ items: z.array(Address) });

/**
 * The four separate notification opt-ins (CLAUDE.md). Order-status e-mails are transactional and
 * always sent; `orderStatus` covers push/in-app order updates only. All start switched off.
 */
export const NotificationPrefs = z.object({
  comebacks: z.boolean(),
  restocks: z.boolean(),
  orderStatus: z.boolean(),
  clubDrops: z.boolean(),
});
export type NotificationPrefs = z.infer<typeof NotificationPrefs>;

export const Preferences = z.object({
  notifications: NotificationPrefs,
  /** Always false for under-18 accounts; the API refuses to switch it on. */
  personalisedAds: z.boolean(),
});
export type Preferences = z.infer<typeof Preferences>;

export const DeleteAccountRequest = z.object({ password: z.string().min(1).max(200) });
