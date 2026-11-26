import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { FakeCarrier } from "./fake-carrier";
import { FileSupplierAdapter } from "./fake-supplier";

const parcel = {
  orderId: "K-2026-000123",
  parcelId: "3f1c2a",
  recipient: {
    name: "Мария Иванова",
    phone: "+359 888 000 000",
    line1: "ул. Тестова 1",
    city: "София",
    postcode: "1000",
    country: "BG",
  },
  weightGrams: 850,
  valueCents: 3400,
};

describe("FakeCarrier", () => {
  it("makes a PDF label and a journey that moves on with time", async () => {
    let now = new Date("2026-11-26T08:00:00Z");
    const carrier = new FakeCarrier(() => now);
    const label = await carrier.createShipment(parcel);
    expect(label.trackingNumber).toMatch(/^FK[0-9A-Z]+$/);
    expect(new TextDecoder().decode(label.labelPdf.slice(0, 5))).toBe("%PDF-");

    expect((await carrier.track(label.trackingNumber)).map((e) => e.status)).toEqual(["label_created"]);
    now = new Date("2026-11-26T15:00:00Z");
    expect((await carrier.track(label.trackingNumber)).at(-1)?.status).toBe("in_transit");
    now = new Date("2026-11-27T12:00:00Z");
    expect((await carrier.track(label.trackingNumber)).at(-1)?.status).toBe("delivered");

    await carrier.cancelShipment(label.trackingNumber);
    expect((await carrier.track(label.trackingNumber)).map((e) => e.status)).toEqual(["exception"]);
  });

  it("serves BG, RO and GR with test offices and lockers", async () => {
    const carrier = new FakeCarrier();
    await expect(
      carrier.createShipment({ ...parcel, recipient: { ...parcel.recipient, country: "PL" } }),
    ).rejects.toThrow(/does not deliver/);
    const points = await carrier.pickupPoints("RO");
    expect(points.map((p) => p.kind)).toEqual(["office", "office", "locker"]);
    await expect(carrier.track("NOT-OURS")).rejects.toThrow();
  });
});

describe("FileSupplierAdapter", () => {
  let dir = "";
  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("writes the purchase order CSV with merged lines and no customer data", async () => {
    dir = await mkdtemp(join(tmpdir(), "kummie-po-"));
    const result = await new FileSupplierAdapter(dir).dispatchPurchaseOrder({
      purchaseOrderId: "PO-2026-0001",
      batchId: "b1",
      supplierId: "kmoon",
      ddp: false,
      deliverTo: { name: "KUMMIE hub", line1: "ул. Пункт 1", city: "София", postcode: "1000", country: "BG" },
      lines: [
        { supplierSku: "KM-1", description: "Album A", quantity: 1, unitCostCents: 1200 },
        { supplierSku: "KM-1", description: "Album A", quantity: 2, unitCostCents: 1200 },
      ],
    });
    expect(result).toMatchObject({ supplierReference: "FILE-PO-2026-0001", channel: "email" });
    const csv = await readFile(join(dir, "PO-2026-0001.csv"), "utf8");
    expect(csv).toContain("PO-2026-0001,KM-1,Album A,3,12.00,36.00");
    expect(csv).not.toContain("Мария");
  });
});
