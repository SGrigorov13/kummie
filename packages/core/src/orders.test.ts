import { describe, expect, it } from "vitest";
import { customerCanCancel, customerSeesChange, staffNextStatuses } from "./orders";

describe("customerCanCancel (A10)", () => {
  it("allows cancelling until the order is batched", () => {
    expect(customerCanCancel("pending_payment")).toBe(true);
    expect(customerCanCancel("paid")).toBe(true);
    expect(customerCanCancel("batched")).toBe(false);
    expect(customerCanCancel("delivered")).toBe(false);
  });
});

describe("staffNextStatuses", () => {
  it("never lets staff mark an order as paid", () => {
    expect(staffNextStatuses("pending_payment")).toEqual(["cancelled"]);
  });

  it("offers the next happy step, cancelling while still with the supplier, and exception", () => {
    expect(staffNextStatuses("paid")).toEqual(["batched", "cancelled", "exception"]);
    expect(staffNextStatuses("supplier_shipped")).toEqual(["received_at_hub", "exception"]);
    expect(staffNextStatuses("out_for_delivery")).toEqual(["delivered", "exception"]);
  });

  it("lets an exception be cancelled and stops at final states", () => {
    expect(staffNextStatuses("exception")).toEqual(["cancelled"]);
    expect(staffNextStatuses("delivered")).toEqual([]);
    expect(staffNextStatuses("refunded")).toEqual([]);
  });
});

describe("customerSeesChange", () => {
  it("is false when two internal states share one customer step", () => {
    expect(customerSeesChange("batched", "ordered_from_supplier")).toBe(false);
    expect(customerSeesChange("packed", "handed_to_carrier")).toBe(false);
  });

  it("is true for a new step or an off-track state", () => {
    expect(customerSeesChange("paid", "batched")).toBe(true);
    expect(customerSeesChange("paid", "cancelled")).toBe(true);
  });
});
