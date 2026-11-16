import { describe, expect, it } from "vitest";
import { format, messages, t } from "./index";

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).toSorted();

describe("i18n", () => {
  it("has the same keys in bg and en, all non-empty", () => {
    const bgKeys = Object.keys(messages.bg).toSorted();
    expect(Object.keys(messages.en).toSorted()).toEqual(bgKeys);
    for (const locale of ["bg", "en"] as const) {
      for (const [key, value] of Object.entries(messages[locale])) {
        expect(value.trim(), `${locale}.${key}`).not.toBe("");
      }
    }
  });

  it("uses the same placeholders in both languages", () => {
    for (const key of Object.keys(messages.bg) as (keyof typeof messages.bg)[]) {
      expect(placeholders(messages.en[key]), key).toEqual(placeholders(messages.bg[key]));
    }
  });

  it("formats placeholders", () => {
    expect(t("en", "vatLine", { rate: 20 })).toBe("incl. VAT 20%");
    expect(t("bg", "stepOf", { n: 3 })).toBe("Стъпка 3 от 7");
    expect(format("{a} {b}", { a: 1 })).toBe("1 {b}");
  });

  it("keeps the promo bar in line with the delivery and Kummies rules (D-026, D-027, D-028)", () => {
    for (const locale of ["bg", "en"] as const) {
      expect(messages[locale].promoBar).toMatch(/79[.,]99/);
      expect(messages[locale].promoBar).toMatch(/30/);
    }
  });
});

describe("Kummies expiry reminders (D-031)", () => {
  it("keep push copy under 60 characters with a 4-digit count", () => {
    for (const locale of ["bg", "en"] as const) {
      for (const key of ["kummies.reminder14", "kummies.reminder3", "kummies.reminder1"] as const) {
        expect(t(locale, key, { count: 1000 }).length, `${locale}.${key}`).toBeLessThanOrEqual(60);
      }
    }
  });
});
