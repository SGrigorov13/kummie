import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { consolidateLines, purchaseOrderCsv } from "@kummie/core";
import type { DispatchResult, PurchaseOrder, SupplierAdapter } from "./supplier";

/**
 * Test supplier channel (M2 until a distributor agreement): instead of e-mailing the
 * purchase order, writes the CSV the supplier would get to a folder (like the "file" e-mail
 * adapter), so batches and the hub flow can be tried locally. Contains no customer data — a
 * purchase order lists only products and quantities.
 */
export class FileSupplierAdapter implements SupplierAdapter {
  readonly name = "file";
  private readonly folder: string;

  constructor(dir: string) {
    this.folder = resolve(dir);
  }

  async dispatchPurchaseOrder(order: PurchaseOrder): Promise<DispatchResult> {
    const lines = consolidateLines(order.lines);
    const safeId = order.purchaseOrderId.replace(/[^a-zA-Z0-9_-]/g, "_");
    await mkdir(this.folder, { recursive: true });
    const csv = purchaseOrderCsv(order.purchaseOrderId, lines);
    const deliver = order.deliverTo;
    const note = [
      `To supplier: ${order.supplierId}`,
      `Batch: ${order.batchId}`,
      `Deliver to: ${deliver.name}, ${deliver.line1}, ${deliver.postcode} ${deliver.city}, ${deliver.country}`,
      `Terms: ${order.ddp ? "DDP" : "standard"}`,
      "",
    ].join("\n");
    await writeFile(resolve(this.folder, `${safeId}.csv`), csv, "utf8");
    await writeFile(resolve(this.folder, `${safeId}.txt`), note, "utf8");
    return { supplierReference: `FILE-${safeId}`, sentAt: new Date(), channel: "email" };
  }
}
