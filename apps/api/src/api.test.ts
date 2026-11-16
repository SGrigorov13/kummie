import { describe, expect, it } from "vitest";
import { FakePaymentProvider } from "./adapters/fake-payment";
import { buildApp } from "./app";
import { loadConfig } from "./config";
import { runTick, type Job } from "./jobs/tick";

const silent = { info: () => {}, error: () => {} };

describe("GET /health", () => {
  it("returns 200 when the database answers", async () => {
    const app = buildApp({ logger: false, checkDb: async () => "ok" });
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "ok", db: "ok" });
    await app.close();
  });

  it("returns 503 when the database fails or is not configured", async () => {
    for (const db of ["error", "not_configured"] as const) {
      const app = buildApp({ logger: false, checkDb: async () => db });
      const response = await app.inject({ method: "GET", url: "/health" });
      expect(response.statusCode).toBe(503);
      expect(response.json()).toMatchObject({ status: "degraded", db });
      await app.close();
    }
  });
});

describe("config", () => {
  it("reads PORT and defaults", () => {
    const config = loadConfig(
      { PORT: "4123", DATABASE_URL: "postgres://u:p@localhost:5432/kummie" },
      "missing.env",
    );
    expect(config.PORT).toBe(4123);
    expect(config.HOST).toBe("127.0.0.1");
    expect(config.DB_POOL_MAX).toBe(5);
  });

  it("rejects a non-postgres DATABASE_URL and an oversized pool", () => {
    expect(() => loadConfig({ DATABASE_URL: "mysql://x" }, "missing.env")).toThrow(/DATABASE_URL/);
    expect(() => loadConfig({ DB_POOL_MAX: "50" }, "missing.env")).toThrow(/DB_POOL_MAX/);
  });
});

describe("tick worker", () => {
  it("runs an empty job list cleanly", async () => {
    expect(await runTick([], silent)).toEqual([]);
  });

  it("isolates failures and enforces the time budget", async () => {
    const jobs: Job[] = [
      { name: "ok", schedule: "frequent", timeoutMs: 1000, run: async () => {} },
      {
        name: "boom",
        schedule: "frequent",
        timeoutMs: 1000,
        run: async () => {
          throw new Error("nope");
        },
      },
      {
        name: "slow",
        schedule: "frequent",
        timeoutMs: 20,
        run: () => new Promise((resolve) => setTimeout(resolve, 500)),
      },
    ];
    const results = await runTick(jobs, silent);
    expect(results.map((result) => [result.name, result.ok])).toEqual([
      ["ok", true],
      ["boom", false],
      ["slow", false],
    ]);
    expect(results[2]?.error).toMatch(/timed out/);
  });
});

describe("FakePaymentProvider", () => {
  const session = {
    orderId: "KM-1",
    amount: { amountCents: 4890, currency: "EUR" as const },
    methods: ["card", "google_pay"] as const,
    locale: "bg" as const,
    returnUrl: "http://localhost:3000/bg/orders/KM-1",
    cancelUrl: "http://localhost:3000/bg/cart",
    idempotencyKey: "session-KM-1",
  };

  async function authorised(provider: FakePaymentProvider) {
    const { sessionId } = await provider.createSession(session);
    const event = await provider.handleWebhook(provider.webhookFor("authorize", sessionId));
    if (event.type !== "payment.authorized") throw new Error("expected authorisation");
    return event.paymentId;
  }

  it("creates idempotent redirect sessions", async () => {
    const provider = new FakePaymentProvider();
    const first = await provider.createSession(session);
    const again = await provider.createSession(session);
    expect(again.sessionId).toBe(first.sessionId);
    expect(first.redirectUrl).toContain(first.sessionId);
  });

  it("captures, then refunds partially and fully, never beyond the captured amount", async () => {
    const provider = new FakePaymentProvider();
    const paymentId = await authorised(provider);
    await provider.capture(paymentId);
    const eur = (amountCents: number) => ({ amountCents, currency: "EUR" as const });
    await provider.refund({ paymentId, amount: eur(2200), reason: "shortage", idempotencyKey: "r1" });
    expect(await provider.getStatus(paymentId)).toBe("partially_refunded");
    await expect(
      provider.refund({ paymentId, amount: eur(5000), reason: "other", idempotencyKey: "r2" }),
    ).rejects.toThrow(/exceeds/);
    await provider.refund({ paymentId, amount: eur(2690), reason: "withdrawal", idempotencyKey: "r3" });
    expect(await provider.getStatus(paymentId)).toBe("refunded");
  });

  it("rejects unsigned or forged webhooks and sessions", async () => {
    const provider = new FakePaymentProvider();
    const { sessionId } = await provider.createSession(session);
    await expect(provider.handleWebhook({ headers: {}, rawBody: "not json" })).rejects.toThrow(/signature/);
    const forged = provider.webhookFor("authorize", sessionId);
    await expect(
      provider.handleWebhook({
        headers: forged.headers,
        rawBody: forged.rawBody.replace("authorize", "fail"),
      }),
    ).rejects.toThrow(/signature/);
    const other = new FakePaymentProvider("http://localhost:3001/fake-pay", "another-secret");
    expect(other.describeSession(sessionId)).toBeNull();
    expect(provider.describeSession(sessionId)).toMatchObject({ orderId: "KM-1", amountCents: 4890 });
  });

  it("survives a restart when the secret is configured", async () => {
    const before = new FakePaymentProvider("http://localhost:3001/fake-pay", "same-secret");
    const { sessionId } = await before.createSession(session);
    const after = new FakePaymentProvider("http://localhost:3001/fake-pay", "same-secret");
    const event = await after.handleWebhook(before.webhookFor("authorize", sessionId));
    expect(event).toMatchObject({ type: "payment.authorized", amount: { amountCents: 4890 } });
  });
});
