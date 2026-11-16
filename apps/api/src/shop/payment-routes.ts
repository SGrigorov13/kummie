import { formatMoney } from "@kummie/core";
import type { FastifyPluginAsync } from "fastify";
import { WebhookSignatureError } from "../adapters/fake-payment";
import { processPaymentEvent, type ShopDeps } from "./orders";

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );

/**
 * Provider webhooks (signature-checked, idempotent) and — only with the fake provider — the hosted
 * "pay / fail" test page that stands in for the bank's page in development and staging.
 */
export function paymentRoutes(deps: ShopDeps): FastifyPluginAsync {
  return async (app) => {
    // Signatures are computed over the exact bytes, so keep the body as a string here.
    app.addContentTypeParser("application/json", { parseAs: "string" }, (_request, body, done) =>
      done(null, body),
    );

    app.post<{ Params: { provider: string } }>("/payments/webhook/:provider", async (request, reply) => {
      if (request.params.provider !== deps.payments.name) return reply.code(404).send({ error: "not_found" });
      const headers = Object.fromEntries(
        Object.entries(request.headers).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
      );
      try {
        const event = await deps.payments.handleWebhook({ headers, rawBody: String(request.body ?? "") });
        const result = await processPaymentEvent(deps, event);
        return { ok: true, result };
      } catch (error) {
        if (error instanceof WebhookSignatureError) return reply.code(400).send({ error: "bad_signature" });
        throw error;
      }
    });

    const fake = deps.fakePayments;
    if (!fake) return;

    app.get<{ Params: { sessionId: string } }>("/fake-pay/:sessionId", async (request, reply) => {
      const session = fake.describeSession(request.params.sessionId);
      reply
        .header("cache-control", "no-store")
        .header("x-robots-tag", "noindex")
        .type("text/html; charset=utf-8");
      if (!session) return "<!doctype html><title>Expired</title><p>This test payment has expired.</p>";
      const bg = session.locale === "bg";
      const amount = escape(formatMoney(session.amountCents, session.locale));
      const action = (kind: string) => `/fake-pay/${encodeURIComponent(request.params.sessionId)}/${kind}`;
      return `<!doctype html>
<html lang="${session.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${bg ? "Тестово плащане" : "Test payment"}</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:420px;margin:40px auto;padding:0 16px;color:#1d1530}
.box{border:2px dashed #5b2bd6;border-radius:12px;padding:24px}button{min-height:44px;padding:0 20px;border-radius:999px;border:2px solid #1d1530;font-weight:700;cursor:pointer;margin:8px 8px 0 0}
.pay{background:#c6ff3d}.fail{background:#fff}</style></head>
<body><div class="box"><h1>${bg ? "Тестово плащане" : "Test payment"}</h1>
<p>${bg ? "Това не е истинска банка. Нищо не се плаща." : "This is not a real bank. Nothing is charged."}</p>
<p><strong>${amount}</strong></p>
<form method="post" enctype="text/plain" action="${action("pay")}" style="display:inline"><button class="pay" name="x" value="1">${bg ? "Плати" : "Pay"}</button></form>
<form method="post" enctype="text/plain" action="${action("fail")}" style="display:inline"><button class="fail" name="x" value="1">${bg ? "Откажи плащането" : "Decline"}</button></form>
</div></body></html>`;
    });

    app.post<{ Params: { sessionId: string; action: string } }>(
      "/fake-pay/:sessionId/:action",
      async (request, reply) => {
        const session = fake.describeSession(request.params.sessionId);
        if (!session || !["pay", "fail"].includes(request.params.action)) {
          return reply.code(404).type("text/plain").send("expired");
        }
        const kind = request.params.action === "pay" ? "authorize" : "fail";
        // Same path as a real provider: a signed webhook, verified and applied.
        const event = await fake.handleWebhook(fake.webhookFor(kind, request.params.sessionId));
        await processPaymentEvent(deps, event);
        return reply.redirect(kind === "authorize" ? session.returnUrl : session.cancelUrl, 303);
      },
    );
  };
}
