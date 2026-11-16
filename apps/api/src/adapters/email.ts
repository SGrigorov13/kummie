/**
 * Email adapter (SMTP provider; Mailpit locally via docker-compose, optional).
 * Order-status mail is transactional and is never bundled with marketing.
 */

export type EmailCategory = "transactional" | "marketing";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** Main action, rendered as a button in the HTML version (the link also stays in the text). */
  cta?: { label: string; url: string };
  locale: "bg" | "en";
  category: EmailCategory;
  /** De-duplicates retries from the tick worker. */
  idempotencyKey: string;
};

export type EmailResult = { messageId: string; accepted: boolean };

export interface EmailAdapter {
  readonly name: string;
  send(message: EmailMessage): Promise<EmailResult>;
}
