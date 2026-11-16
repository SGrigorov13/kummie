import { describe, expect, it } from "vitest";
import { quoteCart } from "./cart";
import {
  addDays,
  businessDay,
  KUMMIES_REDEEM_COST,
  addMonths,
  KUMMIES_VALIDITY_MONTHS,
  kummiesBalance,
  kummiesToRevoke,
  kummiesEarned,
  kummiesReminderChannels,
  kummiesReminderDays,
  kummiesRemindersDue,
  kummiesValidUntil,
  newKummiesLot,
  nextKummiesExpiry,
  redeemKummies,
  revokeKummies,
  spendKummies,
  type KummiesLot,
} from "./kummies";

const NOV_2026 = new Date("2026-11-16T12:00:00Z");

function lot(id: string, earnedOn: string, amount: number, remaining = amount): KummiesLot {
  return { id, earnedOn, validUntil: kummiesValidUntil(earnedOn), amount, remaining };
}

describe("earning (D-027)", () => {
  it("needs at least €30.00 of goods incl. VAT", () => {
    expect(kummiesEarned(2999)).toBe(0);
    expect(kummiesEarned(3000)).toBe(30);
  });

  it("gives 1 Kummie per whole euro", () => {
    expect(kummiesEarned(4599)).toBe(45);
    expect(kummiesEarned(10000)).toBe(100);
  });

  it("counts the final goods amount after the discount, never delivery", () => {
    // €50 goods, €4.90 delivery, €10 Kummies discount → counted on €40.
    const quote = quoteCart([{ priceCents: 5000, qty: 1 }], "BG", 1000, NOV_2026);
    expect(quote.kummiesBaseCents).toBe(4000);
    expect(quote.kummies).toBe(40);
    // €32 goods with a €5 discount drops to €27 → below the €30 minimum.
    expect(quoteCart([{ priceCents: 3200, qty: 1 }], "BG", 500, NOV_2026).kummies).toBe(0);
    // Delivery alone never earns.
    expect(quoteCart([{ priceCents: 2999, qty: 1 }], "BG", 0, NOV_2026).kummies).toBe(0);
  });
});

describe("validity from the payment day (D-031)", () => {
  it("uses the Bulgarian date of the payment", () => {
    // 23:30 UTC on 15 Nov is already 16 Nov in Sofia (UTC+2).
    expect(businessDay(new Date("2026-11-15T23:30:00Z"))).toBe("2026-11-16");
    expect(newKummiesLot("o1", new Date("2026-11-15T23:30:00Z"), 40).earnedOn).toBe("2026-11-16");
  });

  it("is valid for 6 calendar months, last day inclusive", () => {
    expect(KUMMIES_VALIDITY_MONTHS).toBe(6);
    const until = kummiesValidUntil("2026-11-16");
    expect(until).toBe("2027-05-16");
    const lots = [lot("a", "2026-11-16", 40)];
    expect(kummiesBalance(lots, until)).toBe(40);
    expect(kummiesBalance(lots, addDays(until, 1))).toBe(0);
  });

  it("schedules reminders 14, 3 and 1 day before expiry", () => {
    expect(kummiesReminderDays("2026-11-16")).toEqual(["2027-05-02", "2027-05-13", "2027-05-15"]);
  });

  it("handles short months and leap years", () => {
    expect(addMonths("2026-08-31", 6)).toBe("2027-02-28");
    expect(addMonths("2027-08-31", 6)).toBe("2028-02-29");
    expect(addMonths("2026-12-15", 6)).toBe("2027-06-15");
  });
});

describe("reminders due", () => {
  const lots = [lot("a", "2026-01-10", 40), lot("b", "2026-01-10", 25), lot("c", "2026-02-01", 60)];
  const expiry = kummiesValidUntil("2026-01-10");

  it("adds up the unused points of the same expiry day", () => {
    expect(kummiesRemindersDue(lots, addDays(expiry, -14))).toEqual([
      { daysBefore: 14, count: 65, validUntil: expiry },
    ]);
    expect(kummiesRemindersDue(lots, addDays(expiry, -3))[0]?.daysBefore).toBe(3);
    expect(kummiesRemindersDue(lots, addDays(expiry, -1))[0]?.daysBefore).toBe(1);
    expect(kummiesRemindersDue(lots, addDays(expiry, -2))).toEqual([]);
  });

  it("stays silent when the points were already used", () => {
    const used = [lot("a", "2026-01-10", 40, 0)];
    expect(kummiesRemindersDue(used, addDays(expiry, -14))).toEqual([]);
  });

  it("names the next expiry", () => {
    expect(nextKummiesExpiry(lots, "2026-06-01")).toEqual({ count: 65, validUntil: expiry });
    expect(nextKummiesExpiry([], "2026-06-01")).toBeNull();
  });
});

describe("spending (D-030)", () => {
  it("costs 100 Kummies for €5", () => {
    expect(KUMMIES_REDEEM_COST).toBe(100);
    const result = redeemKummies([lot("a", "2026-11-16", 120)], "2026-11-20");
    expect(result?.creditCents).toBe(500);
    expect(result?.lots[0]?.remaining).toBe(20);
    expect(redeemKummies([lot("a", "2026-11-16", 99)], "2026-11-20")).toBeNull();
  });

  it("uses the points that expire first, so none are lost unnecessarily", () => {
    const lots = [lot("new", "2026-11-01", 80), lot("old", "2026-08-01", 50)];
    const after = spendKummies(lots, 100, "2026-11-20");
    expect(after?.find((l) => l.id === "old")?.remaining).toBe(0);
    expect(after?.find((l) => l.id === "new")?.remaining).toBe(30);
  });

  it("ignores expired points", () => {
    const lots = [lot("expired", "2020-01-01", 500), lot("fresh", "2026-11-01", 60)];
    expect(kummiesBalance(lots, "2026-11-20")).toBe(60);
    expect(spendKummies(lots, 100, "2026-11-20")).toBeNull();
  });
});

describe("cancellations and refunds (D-032)", () => {
  it("takes back everything on a full refund", () => {
    expect(kummiesToRevoke(5000, 5000)).toBe(50);
  });

  it("re-counts the order on a partial refund", () => {
    expect(kummiesToRevoke(5000, 1500)).toBe(15); // keeps €35 → 35 Kummies
    expect(kummiesToRevoke(5000, 2500)).toBe(50); // keeps €25 → below €30, all go
  });

  it("takes points from the order first, then from the other points", () => {
    const lots = [lot("KM-1", "2026-10-01", 40, 40), lot("KM-2", "2026-11-01", 50, 10)];
    // KM-2 earned 50, but 40 were already spent: 10 from KM-2, 40 from KM-1.
    const result = revokeKummies(lots, "KM-2", 50, "2026-11-20");
    expect(result.uncovered).toBe(0);
    expect(result.lots.map((l) => [l.id, l.remaining])).toEqual([
      ["KM-1", 0],
      ["KM-2", 0],
    ]);
  });

  it("never goes negative and reports what could not be covered", () => {
    const result = revokeKummies([lot("KM-3", "2026-11-01", 50, 5)], "KM-3", 50, "2026-11-20");
    expect(result.lots[0]?.remaining).toBe(0);
    expect(result.uncovered).toBe(45);
  });
});

describe("reminder channels (D-031)", () => {
  it("always e-mails; pushes only with the Club drops opt-in", () => {
    expect(kummiesReminderChannels({ clubDropsPush: false })).toEqual(["email"]);
    expect(kummiesReminderChannels({ clubDropsPush: true })).toEqual(["email", "push"]);
  });
});
