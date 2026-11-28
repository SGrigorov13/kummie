import { describe, expect, it } from "vitest";
import { estimateDelivery, formatDeliveryWindow, latestWindow } from "./delivery";

const schedule = { weekdays: [1, 4], hour: 8, minute: 30 };

describe("delivery estimate", () => {
  it("adds the closing, the supplier's transit, packing and the courier", () => {
    // Saturday 28 Nov → closes Monday 30 Nov; transit 2–4 working days; courier 1–2.
    const window = estimateDelivery({
      now: new Date("2026-11-28T10:00:00Z"),
      schedule,
      transitDays: { min: 2, max: 4 },
      courierDays: { min: 1, max: 2 },
      minimumOrder: false,
    });
    // from: 30 Nov + 2 wd = 2 Dec, + 1 wd = 3 Dec; to: 30 Nov + 5 wd = 7 Dec, + 2 wd = 9 Dec.
    expect(window).toEqual({ from: "2026-12-03", to: "2026-12-09" });
  });

  it("allows the 7 extra days when the supplier has a minimum order", () => {
    const window = estimateDelivery({
      now: new Date("2026-11-28T10:00:00Z"),
      schedule,
      transitDays: { min: 2, max: 4 },
      courierDays: { min: 1, max: 2 },
      minimumOrder: true,
    });
    expect(window).toEqual({ from: "2026-12-03", to: "2026-12-16" });
  });

  it("takes the latest line for the whole order", () => {
    expect(
      latestWindow([
        { from: "2026-12-03", to: "2026-12-09" },
        null,
        { from: "2026-12-02", to: "2026-12-11" },
      ]),
    ).toEqual({ from: "2026-12-03", to: "2026-12-11" });
    expect(latestWindow([null])).toBeNull();
  });

  it("writes the window for people", () => {
    expect(formatDeliveryWindow({ from: "2026-12-03", to: "2026-12-09" }, "bg")).toBe("3–9 декември");
    expect(formatDeliveryWindow({ from: "2026-11-30", to: "2026-12-04" }, "bg")).toBe(
      "30 ноември – 4 декември",
    );
    expect(formatDeliveryWindow({ from: "2026-12-03", to: "2026-12-09" }, "en")).toBe("3–9 December");
  });
});
