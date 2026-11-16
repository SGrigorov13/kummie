/**
 * Supplier purchase-order dispatch (ARCHITECTURE §5). When a batch closes, the tick worker builds a
 * purchase order and sends it through this adapter — first version email with CSV/PDF, supplier
 * APIs later where offered.
 */

export type PurchaseOrderLine = {
  supplierSku: string;
  description: string;
  quantity: number;
  /** Agreed unit cost in integer euro cents. */
  unitCostCents: number;
};

export type PurchaseOrder = {
  purchaseOrderId: string;
  batchId: string;
  supplierId: string;
  lines: readonly PurchaseOrderLine[];
  /** Ship-to: the Bulgaria hub. */
  deliverTo: { name: string; line1: string; city: string; postcode: string; country: "BG" };
  /** Delivered Duty Paid when the supplier offers it. */
  ddp: boolean;
};

export type DispatchResult = { supplierReference?: string; sentAt: Date; channel: "email" | "api" };

export interface SupplierAdapter {
  readonly name: string;
  dispatchPurchaseOrder(order: PurchaseOrder): Promise<DispatchResult>;
}
