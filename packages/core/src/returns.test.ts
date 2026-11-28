import { describe, expect, it } from "vitest";
import { returnableQty, returnNumber, returnRefundDueOn, withdrawalUntil } from "./returns";

describe("withdrawal", () => {
  it("numbers returns in their own sequence", () => {
    expect(returnNumber(1)).toBe("RET-0001");
    expect(() => returnNumber(0)).toThrow();
  });

  it("gives 14 days after delivery, and 14 days to refund", () => {
    expect(withdrawalUntil("2026-11-28")).toBe("2026-12-12");
    expect(returnRefundDueOn("2026-12-30")).toBe("2027-01-13");
  });

  it("counts what can still go back", () => {
    expect(returnableQty({ qty: 3, refundedQty: 1 }, 1)).toBe(1);
    expect(returnableQty({ qty: 2, refundedQty: 2 }, 0)).toBe(0);
    expect(returnableQty({ qty: 1, refundedQty: 0 }, 2)).toBe(0);
  });
});
