import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createSecretBox, hashPassword, passwordProblems, verifyPassword } from "./crypto";
import { base32Decode, base32Encode, otpauthUrl, totpCode, verifyTotp } from "./totp";

// RFC 6238 test secret "12345678901234567890" (ASCII) in base32.
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));

describe("TOTP (RFC 6238)", () => {
  it("matches the RFC test vectors (last 6 digits)", () => {
    expect(totpCode(RFC_SECRET, Math.floor(59 / 30), 8)).toBe("94287082");
    expect(totpCode(RFC_SECRET, Math.floor(1111111109 / 30), 8)).toBe("07081804");
    expect(totpCode(RFC_SECRET, Math.floor(59 / 30))).toBe("287082");
  });

  it("round-trips base32", () => {
    const bytes = randomBytes(20);
    expect(base32Decode(base32Encode(bytes)).equals(bytes)).toBe(true);
  });

  it("accepts ±1 step of drift and refuses replays", () => {
    const now = new Date(1_800_000_000_000);
    const step = Math.floor(now.getTime() / 30_000);
    const code = totpCode(RFC_SECRET, step - 1);
    expect(verifyTotp(RFC_SECRET, code, now)).toBe(step - 1);
    expect(verifyTotp(RFC_SECRET, code, now, step - 1)).toBeNull();
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, step - 2), now)).toBeNull();
    expect(verifyTotp(RFC_SECRET, "12345", now)).toBeNull();
  });

  it("builds an otpauth link for authenticator apps", () => {
    expect(otpauthUrl("ABC", "owner@kummie.eu")).toMatch(
      /^otpauth:\/\/totp\/KUMMIE%20Admin%3Aowner%40kummie\.eu\?secret=ABC/,
    );
  });
});

describe("passwords (argon2id)", () => {
  it("hashes and verifies", async () => {
    const h = await hashPassword("correct horse 42");
    expect(h).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(h, "correct horse 42")).toBe(true);
    expect(await verifyPassword(h, "wrong")).toBe(false);
    expect(await verifyPassword("not-a-hash", "x")).toBe(false);
  });

  it("asks for long, mixed passwords", () => {
    expect(passwordProblems("short1")).toContain("at least 12 characters");
    expect(passwordProblems("onlylettersherex")).toContain("mix letters with digits or symbols");
    expect(passwordProblems("kummie-hub-2026!")).toEqual([]);
  });
});

describe("secret box (AES-256-GCM)", () => {
  const box = createSecretBox(randomBytes(32).toString("base64"));

  it("seals and opens", () => {
    const sealed = box.seal("JBSWY3DPEHPK3PXP");
    expect(sealed).not.toContain("JBSWY3DPEHPK3PXP");
    expect(box.open(sealed)).toBe("JBSWY3DPEHPK3PXP");
  });

  it("detects tampering and wrong keys", () => {
    const sealed = box.seal("secret");
    const parts = sealed.split(".");
    parts[3] = Buffer.from("other!").toString("base64");
    expect(() => box.open(parts.join("."))).toThrow();
    const other = createSecretBox(randomBytes(32).toString("base64"));
    expect(() => other.open(sealed)).toThrow();
    expect(() => createSecretBox("c2hvcnQ=")).toThrow(/32 bytes/);
  });
});
