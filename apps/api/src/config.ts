import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

const LOG_LEVELS = ["fatal", "error", "warn", "info", "debug", "trace", "silent"] as const;

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  /** cPanel Passenger provides PORT; locally 3001. */
  PORT: z.coerce.number().int().positive().default(3001),
  /** 127.0.0.1 locally (no Windows firewall prompt); set 0.0.0.0 only where needed. */
  HOST: z.string().min(1).default("127.0.0.1"),
  /** postgres://user:password@localhost:5432/kummie — optional so web/admin dev works without a DB. */
  DATABASE_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\//, "DATABASE_URL must start with postgres:// or postgresql://")
    .optional(),
  /** Shared hosting: keep the pool small (ARCHITECTURE §10, ≤ 10). */
  DB_POOL_MAX: z.coerce.number().int().min(1).max(10).default(5),
  LOG_LEVEL: z.enum(LOG_LEVELS).default("info"),
  /** 32 random bytes, base64 — encrypts staff 2FA secrets. Without it the staff API is off. */
  STAFF_SECRET_KEY: z.string().optional(),
  /** Comma-separated origins of the admin app allowed to call the staff API with cookies. */
  ADMIN_ORIGINS: z.string().default("http://localhost:5180,http://127.0.0.1:5180"),
  /** Secure (HTTPS-only) cookies; defaults to on in production. */
  COOKIE_SECURE: z.enum(["true", "false"]).optional(),
  /** Public address of the shop, used in e-mail links (e.g. https://kummie.eu). */
  WEB_URL: z.string().url().default("http://localhost:3000"),
  /** Comma-separated shop origins allowed to call the account API with cookies. */
  WEB_ORIGINS: z.string().default("http://localhost:3000,http://127.0.0.1:3000"),
  /** "smtp" sends through the mail server (Bulinfo, A7); "file" writes e-mails to MAIL_OUTBOX_DIR. */
  EMAIL_TRANSPORT: z.enum(["file", "smtp"]).default("file"),
  /** SMTP server of the hosting (cPanel → Email Accounts → Connect Devices), e.g. mail.kummie.eu. */
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(465),
  /** "true" for port 465 (SSL), "false" for 587 (STARTTLS). */
  SMTP_SECURE: z.enum(["true", "false"]).default("true"),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  /** Sender, a mailbox of the domain: "KUMMIE <hello@kummie.eu>". */
  EMAIL_FROM: z.string().optional(),
  /** Where customer replies go (optional), e.g. the support mailbox. */
  EMAIL_REPLY_TO: z.string().optional(),
  /** Folder for development e-mails, relative to the app root (git-ignored). */
  MAIL_OUTBOX_DIR: z.string().min(1).default("mail-outbox"),
  /**
   * Which proxies may set X-Forwarded-For (needed for per-client rate limits behind Apache):
   * "false", "true", a hop count such as "1", or comma-separated IPs/CIDRs.
   */
  TRUST_PROXY: z.string().default("false"),
  /** Payment provider. Only "fake" exists until the UniCredit vPOS adapter (A6); real sales stay off. */
  PAYMENT_PROVIDER: z.enum(["fake"]).default("fake"),
  /** Signs fake payment sessions and webhooks so they survive restarts. Random per process when empty. */
  FAKE_PAYMENT_SECRET: z.string().optional(),
  /** Public address of this API, used for the provider's return pages (e.g. https://api.kummie.eu). */
  API_URL: z.string().url().default("http://localhost:3001"),
  /**
   * Public base URL of product photos. A path such as "/media" means "served by this API"
   * (API_URL + path); a full URL points at another host serving MEDIA_DIR.
   */
  MEDIA_BASE_URL: z.string().min(1).default("/media"),
  /**
   * Folder for product photos, relative to the app root or absolute. Production: outside the
   * deployed app (e.g. /home/<account>/kummie-media) so a release never deletes photos.
   */
  MEDIA_DIR: z.string().min(1).default("media"),
  /** Test supplier (M2): purchase orders are written as CSV files to this folder (git-ignored). */
  PO_OUTBOX_DIR: z.string().min(1).default("po-outbox"),
  /** Folder with Drizzle SQL migrations, relative to the app root. */
  MIGRATIONS_DIR: z.string().min(1).default("drizzle"),
});

export type Config = z.infer<typeof EnvSchema>;

/**
 * Loads `.env` from the app root when present (never overrides real environment variables), then
 * validates. In production the variables come from the cPanel Node.js app settings instead.
 */
export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  envFile = resolve(process.cwd(), ".env"),
): Config {
  if (env === process.env && existsSync(envFile)) process.loadEnvFile(envFile);
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid API configuration — ${problems}. See apps/api/.env.example.`);
  }
  return parsed.data;
}

/** Turns TRUST_PROXY into Fastify's trustProxy option. */
export function trustProxyOption(
  value: string,
): boolean | string[] | ((address: string, hop: number) => boolean) {
  if (value === "true") return true;
  if (value === "false" || value === "") return false;
  if (/^\d+$/.test(value)) {
    // Trust the first N hops (e.g. Apache in front of Passenger = 1).
    const hops = Number(value);
    return (_address, hop) => hop < hops;
  }
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Splits a comma-separated origin list. */
export function originList(value: string): string[] {
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/** MEDIA_BASE_URL as an absolute URL ("/media" → API_URL + "/media"). */
export function mediaBaseUrl(config: Pick<Config, "MEDIA_BASE_URL" | "API_URL">): string {
  const base = config.MEDIA_BASE_URL.replace(/\/$/, "");
  return base.startsWith("/") ? `${config.API_URL.replace(/\/$/, "")}${base}` : base;
}
