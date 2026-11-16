import { randomUUID } from "node:crypto";
import type {
  CreateSessionInput,
  Money,
  PaymentEvent,
  PaymentProvider,
  PaymentSession,
  PaymentStatus,
  RefundInput,
  RefundResult,
} from "./payment";

type FakePayment = {
  sessionId: string;
  orderId: string;
  amount: Money;
  status: PaymentStatus;
  capturedCents: number;
  refundedCents: number;
};

/**
 * In-memory payment provider for development and tests (D-009). Behaves like a redirect provider:
 * a session yields a hosted URL, a webhook `{ "type": "authorize", "sessionId": … }` authorises it,
 * then capture/refund work with the same rules a real provider enforces.
 */
export class FakePaymentProvider implements PaymentProvider {
  readonly name = "fake";
  private readonly sessions = new Map<string, FakePayment>();
  private readonly payments = new Map<string, FakePayment>();
  private readonly idempotent = new Map<string, unknown>();

  constructor(private readonly baseUrl = "http://localhost:3001/fake-pay") {}

  async createSession(input: CreateSessionInput): Promise<PaymentSession> {
    const cached = this.idempotent.get(input.idempotencyKey);
    if (cached) return cached as PaymentSession;
    if (!Number.isInteger(input.amount.amountCents) || input.amount.amountCents <= 0) {
      throw new Error("amount must be positive integer cents");
    }
    if (input.methods.length === 0) throw new Error("at least one payment method is required");
    const sessionId = `fs_${randomUUID()}`;
    this.sessions.set(sessionId, {
      sessionId,
      orderId: input.orderId,
      amount: input.amount,
      status: "pending",
      capturedCents: 0,
      refundedCents: 0,
    });
    const session = {
      sessionId,
      redirectUrl: `${this.baseUrl}/${sessionId}?locale=${input.locale}`,
      expiresAt: new Date(Date.now() + 30 * 60_000),
    };
    this.idempotent.set(input.idempotencyKey, session);
    return session;
  }

  async handleWebhook({ rawBody }: { headers: Record<string, string | undefined>; rawBody: string }): Promise<PaymentEvent> {
    let body: { type?: string; sessionId?: string; reason?: string };
    try {
      body = JSON.parse(rawBody) as typeof body;
    } catch {
      return { type: "ignored", reason: "invalid JSON" };
    }
    const session = body.sessionId ? this.sessions.get(body.sessionId) : undefined;
    if (!session) return { type: "ignored", reason: "unknown session" };
    if (body.type === "authorize") {
      const paymentId = `fp_${randomUUID()}`;
      session.status = "authorized";
      this.payments.set(paymentId, session);
      return { type: "payment.authorized", sessionId: session.sessionId, paymentId, amount: session.amount };
    }
    if (body.type === "fail") {
      session.status = "failed";
      return { type: "payment.failed", sessionId: session.sessionId, reason: body.reason ?? "declined" };
    }
    return { type: "ignored", reason: `unsupported type ${body.type ?? "(none)"}` };
  }

  async capture(paymentId: string, amount?: Money): Promise<{ status: PaymentStatus }> {
    const payment = this.require(paymentId);
    if (payment.status !== "authorized") throw new Error(`cannot capture a ${payment.status} payment`);
    const cents = amount?.amountCents ?? payment.amount.amountCents;
    if (cents > payment.amount.amountCents) throw new Error("capture exceeds the authorised amount");
    payment.capturedCents = cents;
    payment.status = "captured";
    return { status: payment.status };
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    const cached = this.idempotent.get(input.idempotencyKey);
    if (cached) return cached as RefundResult;
    const payment = this.require(input.paymentId);
    const cents = input.amount.amountCents;
    if (!Number.isInteger(cents) || cents <= 0) throw new Error("refund must be positive integer cents");
    if (payment.refundedCents + cents > payment.capturedCents) throw new Error("refund exceeds the captured amount");
    payment.refundedCents += cents;
    payment.status = payment.refundedCents === payment.capturedCents ? "refunded" : "partially_refunded";
    const result: RefundResult = { refundId: `fr_${randomUUID()}`, status: "succeeded" };
    this.idempotent.set(input.idempotencyKey, result);
    return result;
  }

  async getStatus(paymentId: string): Promise<PaymentStatus> {
    return this.require(paymentId).status;
  }

  private require(paymentId: string): FakePayment {
    const payment = this.payments.get(paymentId);
    if (!payment) throw new Error(`unknown payment ${paymentId}`);
    return payment;
  }
}
