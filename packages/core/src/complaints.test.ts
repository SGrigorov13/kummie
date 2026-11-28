import { describe, expect, it } from "vitest";
import { complaintDueOn, complaintNumber, complaintReminderDue } from "./complaints";

describe("complaints register", () => {
  it("numbers complaints from one register", () => {
    expect(complaintNumber(1)).toBe("RK-0001");
    expect(complaintNumber(12345)).toBe("RK-12345");
    expect(() => complaintNumber(0)).toThrow();
  });

  it("gives one month, shorter months included", () => {
    expect(complaintDueOn("2026-11-28")).toBe("2026-12-28");
    expect(complaintDueOn("2027-01-31")).toBe("2027-02-28");
  });

  it("reminds 7 days and 1 day before, and on the last day", () => {
    expect(complaintReminderDue("2026-12-28", "2026-12-21")).toBe(7);
    expect(complaintReminderDue("2026-12-28", "2026-12-27")).toBe(1);
    expect(complaintReminderDue("2026-12-28", "2026-12-28")).toBe(0);
    expect(complaintReminderDue("2026-12-28", "2026-12-22")).toBeNull();
  });
});
