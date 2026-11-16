import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";

/** argon2id with OWASP-recommended parameters (19 MiB, 2 passes) — fits shared hosting. */
const ARGON = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON);
}

export async function verifyPassword(hashValue: string, password: string): Promise<boolean> {
  try {
    return await verify(hashValue, password);
  } catch {
    return false;
  }
}

/** Staff passwords: at least 12 characters, not only letters or only digits. */
export function passwordProblems(password: string): string[] {
  const problems: string[] = [];
  if (password.length < 12) problems.push("at least 12 characters");
  if (/^[\p{L}]+$/u.test(password) || /^\d+$/.test(password))
    problems.push("mix letters with digits or symbols");
  return problems;
}

/** Random opaque token for cookies and challenges (256 bits, URL-safe). */
export function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Authenticated encryption (AES-256-GCM) for secrets stored in the database, e.g. TOTP seeds.
 * `keyBase64` is STAFF_SECRET_KEY: 32 random bytes, base64.
 */
export function createSecretBox(keyBase64: string) {
  const key = Buffer.from(keyBase64, "base64");
  if (key.length !== 32) throw new Error("STAFF_SECRET_KEY must be 32 bytes, base64-encoded");
  return {
    seal(plain: string): string {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
      return [
        "v1",
        iv.toString("base64"),
        cipher.getAuthTag().toString("base64"),
        body.toString("base64"),
      ].join(".");
    },
    open(sealed: string): string {
      const [version, iv, tag, body] = sealed.split(".");
      if (version !== "v1" || !iv || !tag || !body) throw new Error("Unknown secret format");
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
      decipher.setAuthTag(Buffer.from(tag, "base64"));
      return Buffer.concat([decipher.update(Buffer.from(body, "base64")), decipher.final()]).toString("utf8");
    },
  };
}

export type SecretBox = ReturnType<typeof createSecretBox>;
