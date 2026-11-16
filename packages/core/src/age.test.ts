import { describe, expect, it } from "vitest";
import { ageOn, checkAge, DEFAULT_MINIMUM_AGE, isMinor } from "./age";

describe("ageOn", () => {
  it("counts whole years and turns over on the birthday", () => {
    expect(ageOn("2010-11-16", "2026-11-15")).toBe(15);
    expect(ageOn("2010-11-16", "2026-11-16")).toBe(16);
  });

  it("treats 29 February birthdays as 1 March in common years", () => {
    expect(ageOn("2008-02-29", "2026-02-28")).toBe(17);
    expect(ageOn("2008-02-29", "2026-03-01")).toBe(18);
  });

  it("rejects impossible or malformed dates", () => {
    expect(ageOn("2010-02-30", "2026-11-16")).toBeNull();
    expect(ageOn("16.11.2010", "2026-11-16")).toBeNull();
  });
});

describe("checkAge", () => {
  const today = "2026-11-16";

  it("defaults to 14 until the lawyer confirms the minimum age", () => {
    expect(DEFAULT_MINIMUM_AGE).toBe(14);
    expect(checkAge("2012-11-17", today)).toEqual({ ok: false, reason: "too_young", minimumAge: 14 });
    expect(checkAge("2012-11-16", today)).toEqual({ ok: true, age: 14, minor: true });
  });

  it("uses the configured minimum age", () => {
    expect(checkAge("2010-11-16", today, 16)).toEqual({ ok: true, age: 16, minor: true });
    expect(checkAge("2010-11-17", today, 16)).toMatchObject({ ok: false, reason: "too_young" });
  });

  it("marks adults from the 18th birthday", () => {
    expect(checkAge("2008-11-16", today)).toEqual({ ok: true, age: 18, minor: false });
    expect(isMinor("2008-11-17", today)).toBe(true);
    expect(isMinor("2008-11-16", today)).toBe(false);
  });

  it("rejects future dates and implausible ages", () => {
    expect(checkAge("2027-01-01", today)).toMatchObject({ ok: false, reason: "invalid" });
    expect(checkAge("1890-01-01", today)).toMatchObject({ ok: false, reason: "invalid" });
  });
});
