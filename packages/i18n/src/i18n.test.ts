import { describe, expect, it } from "vitest";
import { format, messages, t } from "./index";

describe("i18n", () => {
  it("has the same keys in bg and en, all non-empty", () => {
    const bgKeys = Object.keys(messages.bg).sort();
    expect(Object.keys(messages.en).sort()).toEqual(bgKeys);
    for (const locale of ["bg", "en"] as const) {
      for (const [key, value] of Object.entries(messages[locale])) {
        expect(value.trim(), `${locale}.${key}`).not.toBe("");
      }
    }
  });

  it("uses the same placeholders in both languages", () => {
    const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of Object.keys(messages.bg) as (keyof typeof messages.bg)[]) {
      expect(placeholders(messages.en[key]), key).toEqual(placeholders(messages.bg[key]));
    }
  });

  it("formats placeholders", () => {
    expect(t("en", "vatLine", { rate: 20 })).toBe("VAT 20%");
    expect(t("bg", "stepOf", { n: 3 })).toBe("Стъпка 3 от 7");
    expect(format("{a} {b}", { a: 1 })).toBe("1 {b}");
  });

  it("carries the D-007 promo bar copy", () => {
    expect(messages.en.promoBar).toBe(
      "HURRY!!! ORDER IT NOW * COLLECT MORE KUMMIES AND WIN AWARD * FREE DELIVERY OVER 79.99 EUR",
    );
    expect(messages.bg.promoBar).toContain("79,99");
  });
});
