import type { EmailAdapter } from "../adapters/email";
import type { Config } from "../config";
import { createFileEmailAdapter } from "./file-adapter";
import { createSmtpEmailAdapter } from "./smtp-adapter";

/**
 * Picks the e-mail adapter from the settings: "smtp" sends through the mail server (production),
 * "file" writes each e-mail to MAIL_OUTBOX_DIR (development). SMTP without its settings is a
 * start-up error, so a half-configured server never silently drops e-mails.
 */
export function createEmailAdapter(config: Config): EmailAdapter {
  if (config.EMAIL_TRANSPORT === "file") return createFileEmailAdapter(config.MAIL_OUTBOX_DIR);
  const missing = (["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "EMAIL_FROM"] as const).filter(
    (k) => !config[k],
  );
  if (missing.length > 0) {
    throw new Error(`EMAIL_TRANSPORT=smtp needs ${missing.join(", ")} (see apps/api/.env.example)`);
  }
  return createSmtpEmailAdapter({
    host: config.SMTP_HOST as string,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE === "true",
    user: config.SMTP_USER as string,
    password: config.SMTP_PASSWORD as string,
    from: config.EMAIL_FROM as string,
    replyTo: config.EMAIL_REPLY_TO,
  });
}
