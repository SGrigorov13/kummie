import { describe, expect, it } from "vitest";
import {
  allGreen,
  checkoutMode,
  goLiveConditions,
  napUpdateDaysLeft,
  napUpdateDueOn,
  type GoLiveInput,
} from "./golive";

const ready: GoLiveInput = {
  company: {
    legalName: "СГ Корпорейшън ЕООД",
    eik: "123456789",
    vatNumber: "BG123456789",
    registeredAddress: "София",
    contactEmail: "hello@kummie.eu",
    contactPhone: "+359 888 000 000",
    iban: "BG80BNBG96611020345678",
    euResponsiblePerson: "СГ Корпорейшън ЕООД",
    ossEffectiveFrom: "2027-01-01",
    napRfNumber: "RF0001234",
    napEShopNumber: "RF0001234",
    napRegisteredOn: "2026-12-10",
    deliveryFeesCents: { BG: 490, RO: 690, GR: 790 },
  },
  today: "2027-01-05",
  paymentProvider: "unicredit",
  emailTransport: "smtp",
  legalApproved: {
    terms: "2026-12-20",
    withdrawal: "2026-12-20",
    returns: "2026-12-20",
    guarantee: "2026-12-20",
    privacy: "2026-12-20",
    complaints: "2026-12-20",
  },
};

describe("goLiveConditions", () => {
  it("is all green when everything is in place", () => {
    const conditions = goLiveConditions(ready);
    expect(conditions.map((c) => c.id)).toEqual([
      "company",
      "oss",
      "nap",
      "payment",
      "email",
      "legal",
      "delivery",
    ]);
    expect(allGreen(conditions)).toBe(true);
  });

  it("names exactly what is missing", () => {
    const conditions = goLiveConditions({
      ...ready,
      company: {
        ...ready.company,
        eik: null,
        iban: "  ",
        napEShopNumber: null,
        ossEffectiveFrom: "2027-02-01",
      },
      paymentProvider: "fake",
      emailTransport: "file",
      legalApproved: { ...ready.legalApproved, privacy: null },
    });
    const byId = Object.fromEntries(conditions.map((c) => [c.id, c]));
    expect(byId.company?.missing).toEqual(["eik", "iban"]);
    expect(byId.oss?.missing).toEqual(["ossEffectiveFrom:2027-02-01"]);
    expect(byId.nap?.missing).toEqual(["napEShopNumber"]);
    expect(byId.payment?.ok).toBe(false);
    expect(byId.email?.ok).toBe(false);
    expect(byId.legal?.missing).toEqual(["privacy"]);
    expect(byId.delivery?.ok).toBe(true);
    expect(allGreen(conditions)).toBe(false);
  });
});

describe("checkoutMode", () => {
  it("allows only test payments before go-live and only real ones after", () => {
    expect(checkoutMode(false, "fake", false)).toBe("test");
    expect(checkoutMode(false, "unicredit", true)).toBe("closed");
    expect(checkoutMode(true, "unicredit", true)).toBe("live");
    expect(checkoutMode(true, "unicredit", false)).toBe("closed");
    expect(checkoutMode(true, "fake", true)).toBe("closed");
  });
});

describe("Приложение № 33 updates", () => {
  it("are due 7 days after the change", () => {
    expect(napUpdateDueOn("2026-12-28")).toBe("2027-01-04");
    expect(napUpdateDaysLeft("2026-12-28", "2027-01-01")).toBe(3);
    expect(napUpdateDaysLeft("2026-12-28", "2027-01-06")).toBe(-2);
  });
});
