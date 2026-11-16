import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
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

/** Thrown for webhooks whose signature does not verify; the route answers 400. */
export class WebhookSignatureError extends Error {
  constructor() {
    super("invalid webhook signature");
    this.name = "WebhookSignatureError";
  }
}

/** What a fake session carries, signed into its id (no server memory needed). */
export type FakeSessionData = {
  orderId: string;
  amountCents: number;
  locale: "bg" | "en";
  returnUrl: string;
  cancelUrl: string;
  expiresAt: number;
};

const SIGNATURE_HEADER = "x-fake-signature";

/**
 * Payment provider for development and staging (D-009) until the UniCredit adapter exists (A6).
 * Behaves like a redirect provider: a session yields a hosted page URL; the page "pays" or "fails"
 * by sending a signed webhook. Sessions and payment ids are signed tokens, so they survive restarts
 * and several server processes (cPanel Passenger). Capture/refund limits are tracked per process
 * as a best effort — our own database is the real guard.
 */
export class FakePaymentProvider implements PaymentProvider {
  readonly name = "fake";
  private readonly secret: Buffer;
  private readonly captured = new Map<string, number>();
  private readonly refunded = new Map<string, number>();
  private readonly refundResults = new Map<string, RefundResult>();

  constructor(
    private readonly pageBaseUrl = "http://localhost:3001/fake-pay",
    secret?: string,
  ) {
    this.secret = secret ? Buffer.from(secret) : randomBytes(32);
  }

  private sign(value: string): string {
    return createHmac("sha256", this.secret).update(value).digest("base64url");
  }

  private verify(value: string, signature: string | undefined): boolean {
    if (!signature) return false;
    const expected = Buffer.from(this.sign(value));
    const given = Buffer.from(signature);
    return expected.length === given.length && timingSafeEqual(expected, given);
  }

  /**
   * Encrypts and authenticates (AES-256-GCM), so the token in the page URL (and in server logs)
   * reveals nothing — it carries return URLs with the guest's order key. The IV is derived from the
   * plaintext, so the same session data always gives the same token (idempotent sessions).
   */
  private seal(data: object): string {
    const plain = Buffer.from(JSON.stringify(data));
    const key = createHash("sha256").update(this.secret).digest();
    const iv = createHmac("sha256", this.secret).update(plain).digest().subarray(0, 12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const body = Buffer.concat([cipher.update(plain), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
  }

  private unseal<T>(token: string): T | null {
    try {
      const raw = Buffer.from(token, "base64url");
      const key = createHash("sha256").update(this.secret).digest();
      const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12));
      decipher.setAuthTag(raw.subarray(12, 28));
      const plain = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]);
      return JSON.parse(plain.toString("utf8")) as T;
    } catch {
      return null;
    }
  }

  async createSession(input: CreateSessionInput): Promise<PaymentSession> {
    if (!Number.isInteger(input.amount.amountCents) || input.amount.amountCents <= 0) {
      throw new Error("amount must be positive integer cents");
    }
    if (input.methods.length === 0) throw new Error("at least one payment method is required");
    // Deterministic for the same idempotency key, like a real provider's de-duplication.
    const expiresAt = Math.ceil((Date.now() + 30 * 60_000) / 600_000) * 600_000;
    const data: FakeSessionData & { k: string } = {
      orderId: input.orderId,
      amountCents: input.amount.amountCents,
      locale: input.locale,
      returnUrl: input.returnUrl,
      cancelUrl: input.cancelUrl,
      expiresAt,
      k: createHash("sha256").update(input.idempotencyKey).digest("hex").slice(0, 16),
    };
    const sessionId = `fs_${this.seal(data)}`;
    return {
      sessionId,
      redirectUrl: `${this.pageBaseUrl}/${encodeURIComponent(sessionId)}`,
      expiresAt: new Date(expiresAt),
    };
  }

  /** Reads a session for the hosted test page; null when forged or expired. */
  describeSession(sessionId: string): FakeSessionData | null {
    if (!sessionId.startsWith("fs_")) return null;
    const data = this.unseal<FakeSessionData>(sessionId.slice(3));
    return data && data.expiresAt > Date.now() ? data : null;
  }

  /** The signed webhook the hosted page sends after "Pay" or "Fail". */
  webhookFor(
    type: "authorize" | "fail",
    sessionId: string,
  ): { headers: Record<string, string>; rawBody: string } {
    const rawBody = JSON.stringify({ type, sessionId });
    return { headers: { [SIGNATURE_HEADER]: this.sign(rawBody) }, rawBody };
  }

  async handleWebhook({
    headers,
    rawBody,
  }: {
    headers: Record<string, string | undefined>;
    rawBody: string;
  }): Promise<PaymentEvent> {
    if (!this.verify(rawBody, headers[SIGNATURE_HEADER])) throw new WebhookSignatureError();
    let body: { type?: string; sessionId?: string; reason?: string };
    try {
      body = JSON.parse(rawBody) as typeof body;
    } catch {
      return { type: "ignored", reason: "invalid JSON" };
    }
    const session = body.sessionId ? this.describeSession(body.sessionId) : null;
    if (!session || !body.sessionId) return { type: "ignored", reason: "unknown or expired session" };
    const amount: Money = { amountCents: session.amountCents, currency: "EUR" };
    if (body.type === "authorize") {
      const paymentId = `fp_${this.seal({ s: body.sessionId.slice(-24), a: session.amountCents })}`;
      return { type: "payment.authorized", sessionId: body.sessionId, paymentId, amount };
    }
    if (body.type === "fail") {
      return { type: "payment.failed", sessionId: body.sessionId, reason: body.reason ?? "declined" };
    }
    return { type: "ignored", reason: `unsupported type ${body.type ?? "(none)"}` };
  }

  private authorisedCents(paymentId: string): number {
    const data = paymentId.startsWith("fp_") ? this.unseal<{ a: number }>(paymentId.slice(3)) : null;
    if (!data) throw new Error(`unknown payment ${paymentId}`);
    return data.a;
  }

  async capture(paymentId: string, amount?: Money): Promise<{ status: PaymentStatus }> {
    const authorised = this.authorisedCents(paymentId);
    const cents = amount?.amountCents ?? authorised;
    if (cents > authorised) throw new Error("capture exceeds the authorised amount");
    this.captured.set(paymentId, cents);
    return { status: "captured" };
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    const cached = this.refundResults.get(input.idempotencyKey);
    if (cached) return cached;
    const captured = this.captured.get(input.paymentId) ?? this.authorisedCents(input.paymentId);
    const cents = input.amount.amountCents;
    if (!Number.isInteger(cents) || cents <= 0) throw new Error("refund must be positive integer cents");
    const already = this.refunded.get(input.paymentId) ?? 0;
    if (already + cents > captured) throw new Error("refund exceeds the captured amount");
    this.refunded.set(input.paymentId, already + cents);
    const result: RefundResult = { refundId: `fr_${randomBytes(8).toString("hex")}`, status: "succeeded" };
    this.refundResults.set(input.idempotencyKey, result);
    return result;
  }

  async getStatus(paymentId: string): Promise<PaymentStatus> {
    const authorised = this.authorisedCents(paymentId);
    const refunded = this.refunded.get(paymentId) ?? 0;
    if (refunded > 0)
      return refunded >= (this.captured.get(paymentId) ?? authorised) ? "refunded" : "partially_refunded";
    return this.captured.has(paymentId) ? "captured" : "authorized";
  }
}
