import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { EmailAdapter, EmailMessage, EmailResult } from "../adapters/email";

/**
 * Development e-mail: every message is written to a text file in MAIL_OUTBOX_DIR instead of being
 * sent, so sign-up and password links can be opened locally. The SMTP adapter (Bulinfo, A7) replaces
 * it in production. The folder is git-ignored; files contain personal data, so never use it live.
 */
export function createFileEmailAdapter(dir: string): EmailAdapter {
  const folder = resolve(dir);
  return {
    name: "file",
    async send(message: EmailMessage): Promise<EmailResult> {
      await mkdir(folder, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const safeKey = message.idempotencyKey.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
      const file = resolve(folder, `${stamp}-${safeKey}.txt`);
      const body = [
        `To: ${message.to}`,
        `Subject: ${message.subject}`,
        `Category: ${message.category}`,
        `Locale: ${message.locale}`,
        "",
        message.text,
        "",
      ].join("\n");
      await writeFile(file, body, "utf8");
      return { messageId: file, accepted: true };
    },
  };
}
