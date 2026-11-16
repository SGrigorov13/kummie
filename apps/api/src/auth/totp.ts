import { createHmac, randomBytes } from "node:crypto";

/**
 * Time-based one-time passwords (RFC 6238, SHA-1, 30 s, 6 digits) — what Google Authenticator,
 * Microsoft Authenticator, 1Password etc. use. No external dependency.
 */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const TOTP_PERIOD_SECONDS = 30;
const DIGITS = 6;

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/, "").replace(/\s/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) throw new Error("Invalid base32 character");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A new random secret (160 bits), base32 for authenticator apps. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function timeStep(now: Date = new Date()): number {
  return Math.floor(now.getTime() / 1000 / TOTP_PERIOD_SECONDS);
}

/** The code for one time step. */
export function totpCode(secretBase32: string, step: number, digits = DIGITS): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac("sha1", base32Decode(secretBase32)).update(counter).digest();
  const offset = (hmac[hmac.length - 1] as number) & 0x0f;
  const binary = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return binary.toString().padStart(digits, "0");
}

/**
 * Checks a code with ±1 step of clock drift. Returns the matched step (store it to block replays),
 * or null. Steps at or below `lastUsedStep` are refused.
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  now: Date = new Date(),
  lastUsedStep: number | null = null,
): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const current = timeStep(now);
  for (const step of [current - 1, current, current + 1]) {
    if (lastUsedStep !== null && step <= lastUsedStep) continue;
    if (totpCode(secretBase32, step) === code) return step;
  }
  return null;
}

/** otpauth:// link that authenticator apps read from a QR code. */
export function otpauthUrl(secretBase32: string, account: string, issuer = "KUMMIE Admin"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: "SHA1",
    digits: "6",
    period: "30",
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
