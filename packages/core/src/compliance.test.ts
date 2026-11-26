import { describe, expect, it } from "vitest";
import { badgeProblems, missingComplianceFields, type ComplianceDraft } from "./compliance";

const complete: ComplianceDraft = {
  title: "KUMMIE Collector Binder",
  sourcing: "KUMMIE_ORIGINAL",
  state: "IN_STOCK_EU",
  isLimited: false,
  versions: ["A5 · 20 sheets"],
  pricesCents: [2200],
  dispatchEstimate: { bg: "3–5 дни", en: "3–5 days" },
  deliveryRegions: ["BG", "RO", "GR"],
  manufacturer: "KUMMIE Originals",
  euResponsiblePerson: "СГ Корпорейшън ЕООД",
  safetyInfo: { bg: "Не е играчка.", en: "Not a toy." },
  warnings: [],
  safetyNone: false,
  returnExceptions: [],
  returnExceptionsNone: true,
};

describe("publishing gate (GPSR Art. 19)", () => {
  it("passes a complete product", () => {
    expect(missingComplianceFields(complete)).toEqual([]);
  });

  it("lists every missing field of an empty draft", () => {
    const empty: ComplianceDraft = {
      title: "",
      sourcing: null,
      state: null,
      isLimited: false,
      versions: [],
      pricesCents: [],
      dispatchEstimate: null,
      deliveryRegions: [],
      manufacturer: null,
      euResponsiblePerson: " ",
      safetyInfo: null,
      warnings: [],
      safetyNone: false,
      returnExceptions: [],
      returnExceptionsNone: false,
    };
    expect(missingComplianceFields(empty)).toEqual([
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
  });

  it("needs both languages", () => {
    expect(missingComplianceFields({ ...complete, dispatchEstimate: { bg: "3–5 дни" } })).toEqual([
      "dispatchEstimate",
    ]);
    expect(missingComplianceFields({ ...complete, warnings: [{ en: "Small parts" }] })).toEqual(["safety"]);
  });

  it("accepts an explicit 'none' but never an empty answer", () => {
    expect(missingComplianceFields({ ...complete, safetyInfo: null, safetyNone: true })).toEqual([]);
    expect(missingComplianceFields({ ...complete, safetyInfo: null })).toEqual(["safety"]);
    expect(missingComplianceFields({ ...complete, returnExceptionsNone: false })).toEqual([
      "returnExceptions",
    ]);
    expect(
      missingComplianceFields({
        ...complete,
        returnExceptionsNone: false,
        returnExceptions: [{ bg: "Отворени албуми не се връщат.", en: "Opened albums cannot be returned." }],
      }),
    ).toEqual([]);
  });

  it("rejects zero or fractional prices and blank versions", () => {
    expect(missingComplianceFields({ ...complete, pricesCents: [0] })).toEqual(["price"]);
    expect(missingComplianceFields({ ...complete, variantsWithoutOffer: 1 })).toEqual(["supplierOffer"]);
    expect(missingComplianceFields({ ...complete, variantsWithoutOffer: 0 })).toEqual([]);
    expect(missingComplianceFields({ ...complete, pricesCents: [19.99] })).toEqual(["price"]);
    expect(missingComplianceFields({ ...complete, versions: ["Version A", " "] })).toEqual(["version"]);
  });

  it("keeps LIMITED out of the stored state", () => {
    expect(badgeProblems({ state: "LIMITED" as never, isLimited: false })).toHaveLength(1);
    expect(badgeProblems({ state: "NEW_DROP", isLimited: true })).toEqual([]);
  });
});
