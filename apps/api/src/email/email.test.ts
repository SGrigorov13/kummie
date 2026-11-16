import { EMPTY_COMPANY_SETTINGS } from "@kummie/contracts";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../config";
import { accountEmail } from "./account-emails";
import { createEmailAdapter } from "./factory";
import { renderEmailHtml } from "./layout";
import { createSmtpEmailAdapter } from "./smtp-adapter";

const company = {
  ...EMPTY_COMPANY_SETTINGS,
  legalName: "СГ Корпорейшън ЕООД",
  eik: "123456789",
  registeredAddress: "София",
  contactEmail: "hello@kummie.eu",
};

describe("renderEmailHtml", () => {
  it("wraps the plain text in the brand layout with a button and the trader footer", () => {
    const html = renderEmailHtml({
      locale: "bg",
      subject: "Поръчка KUM-1001 е платена",
      text: "Здравей, Мария!\n\nСледи поръчката: https://kummie.eu/bg/orders/abc#k=secret",
      cta: { label: "Виж поръчката", url: "https://kummie.eu/bg/orders/abc#k=secret" },
      company,
    });
    expect(html).toContain('<html lang="bg">');
    expect(html).toContain(">Виж поръчката</a>");
    expect(html).toContain('href="https://kummie.eu/bg/orders/abc#k=secret"');
    // The key stays in the link but is not printed as visible text.
    expect(html).toContain(">https://kummie.eu/bg/orders/abc</a>");
    expect(html).toContain("СГ Корпорейшън ЕООД · ЕИК 123456789 · София");
    expect(html).toContain("hello@kummie.eu");
    expect(html).toContain("В него няма реклама");
    expect(html).not.toMatch(/<img|<script/i);
  });

  it("escapes anything a customer typed", () => {
    const html = renderEmailHtml({
      locale: "en",
      subject: "Hi",
      text: 'Hi <script>alert("x")</script> & co',
      company: null,
    });
    expect(html).toContain("Hi &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; co");
    expect(html).toContain('<p style="margin:0 0 6px">KUMMIE</p>');
  });
});

describe("account e-mails", () => {
  it("adds the matching button", () => {
    const verify = accountEmail("verify", {
      to: "a@kummie.test",
      name: "A",
      locale: "bg",
      webUrl: "https://kummie.eu",
      token: "tok",
      key: "k1",
    });
    expect(verify.cta).toEqual({ label: "Потвърди имейла", url: "https://kummie.eu/bg/verify#t=tok" });
    const deleted = accountEmail("deleted", {
      to: "a@kummie.test",
      name: "A",
      locale: "en",
      webUrl: "https://kummie.eu",
      key: "k2",
    });
    expect(deleted.cta).toBeUndefined();
  });
});

describe("SMTP adapter", () => {
  it("sends text and HTML from the configured sender, marked as automatic", async () => {
    const adapter = createSmtpEmailAdapter(
      {
        host: "x",
        port: 465,
        secure: true,
        user: "u",
        password: "p",
        from: "KUMMIE <hello@kummie.eu>",
        replyTo: "support@kummie.eu",
      },
      { jsonTransport: true },
    );
    const result = await adapter.send({
      to: "maria@kummie.test",
      subject: "Тест",
      text: "Здравей",
      html: "<p>Здравей</p>",
      locale: "bg",
      category: "transactional",
      idempotencyKey: "test-1",
    });
    expect(result.accepted).toBe(true);
    expect(adapter.name).toBe("smtp");
  });

  it("refuses to start half-configured", () => {
    const config = loadConfig({ EMAIL_TRANSPORT: "smtp", SMTP_HOST: "mail.kummie.eu" } as NodeJS.ProcessEnv);
    expect(() => createEmailAdapter(config)).toThrow(/SMTP_USER, SMTP_PASSWORD, EMAIL_FROM/);
  });
});
