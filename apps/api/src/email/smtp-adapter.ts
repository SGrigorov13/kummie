import { createTransport } from "nodemailer";
import type { EmailAdapter, EmailMessage, EmailResult } from "../adapters/email";

export type SmtpSettings = {
  host: string;
  port: number;
  /** true for port 465 (SSL); false for 587 with STARTTLS. */
  secure: boolean;
  user: string;
  password: string;
  /** e.g. "KUMMIE <hello@kummie.eu>" — must be a mailbox of the domain for SPF/DKIM to pass. */
  from: string;
  replyTo?: string | undefined;
};

/**
 * E-mail over SMTP (Bulinfo mail server, A7). One connection per message: the outbox sends a few
 * e-mails per run, and shared hosting closes idle connections anyway. Bulinfo allows about 300
 * e-mails per hour from the hosting mailbox (ARCHITECTURE §10).
 *
 * `transport` lets tests pass Nodemailer's JSON transport instead of a real server.
 */
export function createSmtpEmailAdapter(
  settings: SmtpSettings,
  transport: Parameters<typeof createTransport>[0] = {
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    auth: { user: settings.user, pass: settings.password },
    connectionTimeout: 15_000,
    socketTimeout: 30_000,
  },
): EmailAdapter {
  const transporter = createTransport(transport);
  return {
    name: "smtp",
    async send(message: EmailMessage): Promise<EmailResult> {
      const info = await transporter.sendMail({
        from: settings.from,
        ...(settings.replyTo ? { replyTo: settings.replyTo } : {}),
        to: message.to,
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
        headers: {
          // Tells mail servers and auto-responders this is an automatic, transactional message.
          "Auto-Submitted": "auto-generated",
          "X-Auto-Response-Suppress": "All",
          "X-KUMMIE-Key": message.idempotencyKey.slice(0, 120),
        },
      });
      const accepted = Array.isArray(info.accepted) ? info.accepted.length > 0 : true;
      return { messageId: String(info.messageId ?? ""), accepted };
    },
  };
}
