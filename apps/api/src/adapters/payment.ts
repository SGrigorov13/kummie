/**
 * Payment provider adapter (D-009). The provider is NOT chosen yet: business logic talks only to this
 * interface; `FakePaymentProvider` stands in until then.
 *
 * Rules: card data never touches our servers — sessions use provider-hosted fields or a redirect.
 * Launch scope: cards and wallets only, no cash on delivery. Money is integer euro cents.
 */

export type Money = { amountCents: number; currency: "EUR" };

export type PaymentMethod = "card" | "apple_pay" | "google_pay";

export type CreateSessionInput = {
  orderId: string;
  amount: Money;
  /** Allowed methods for this checkout. Never "cash_on_delivery". */
  methods: readonly PaymentMethod[];
  customerEmail?: string;
  locale: "bg" | "en";
  returnUrl: string;
  cancelUrl: string;
  /** Lets the provider de-duplicate retries. */
  idempotencyKey: string;
};

export type PaymentSession = {
  sessionId: string;
  /** Provider-hosted page; the browser (or the app's in-app browser) goes here. */
  redirectUrl: string;
  expiresAt: Date;
};

export type PaymentStatus =
  "pending" | "authorized" | "captured" | "failed" | "cancelled" | "refunded" | "partially_refunded";

export type PaymentEvent =
  | {
      type: "payment.authorized";
      sessionId: string;
      paymentId: string;
      amount: Money;
      /** Card details for the Н-18 documents: authorisation code, vPOS terminal, transaction reference. */
      card?: { authCode: string; terminalId: string; transactionRef: string };
    }
  | { type: "payment.captured"; paymentId: string; amount: Money }
  | { type: "payment.failed"; sessionId: string; reason: string }
  | { type: "refund.succeeded"; paymentId: string; refundId: string; amount: Money }
  | { type: "ignored"; reason: string };

export type RefundInput = {
  paymentId: string;
  /** Partial refunds per order line are supported (shortages, ARCHITECTURE §4). */
  amount: Money;
  reason: "shortage" | "withdrawal" | "cancelled" | "damaged" | "other";
  idempotencyKey: string;
};

export type RefundResult = { refundId: string; status: "succeeded" | "pending" | "failed" };

export interface PaymentProvider {
  readonly name: string;
  createSession(input: CreateSessionInput): Promise<PaymentSession>;
  /** Verifies the signature and turns a provider webhook into a typed event. */
  handleWebhook(input: {
    headers: Record<string, string | undefined>;
    rawBody: string;
  }): Promise<PaymentEvent>;
  /** Captures an authorised payment (full amount when `amount` is omitted). */
  capture(paymentId: string, amount?: Money): Promise<{ status: PaymentStatus }>;
  refund(input: RefundInput): Promise<RefundResult>;
  getStatus(paymentId: string): Promise<PaymentStatus>;
}
