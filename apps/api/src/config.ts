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
  ADMIN_ORIGINS: z.string().default("http://localhost:5173,http://127.0.0.1:5173"),
  /** Secure (HTTPS-only) cookies; defaults to on in production. */
  COOKIE_SECURE: z.enum(["true", "false"]).optional(),
  /** Public base URL of uploaded media (product images). */
  MEDIA_BASE_URL: z.string().min(1).default("/media"),
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
