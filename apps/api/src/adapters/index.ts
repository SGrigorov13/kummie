/** Every external service sits behind one of these interfaces (CLAUDE.md, ARCHITECTURE §1). */
export type { Address, CarrierAdapter, Label, ParcelInput, TrackingEvent, TrackingStatus } from "./carrier";
export type { EmailAdapter, EmailCategory, EmailMessage, EmailResult } from "./email";
export { FakePaymentProvider } from "./fake-payment";
export type {
  CreateSessionInput,
  Money,
  PaymentEvent,
  PaymentMethod,
  PaymentProvider,
  PaymentSession,
  PaymentStatus,
  RefundInput,
  RefundResult,
} from "./payment";
export type { PushAdapter, PushCategory, PushMessage, PushResult } from "./push";
export type { StorageAdapter, StoredFile } from "./storage";
export type { DispatchResult, PurchaseOrder, PurchaseOrderLine, SupplierAdapter } from "./supplier";
