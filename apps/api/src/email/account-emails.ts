import { t, type Locale, type MessageKey } from "@kummie/i18n";
import type { EmailMessage } from "../adapters/email";

export type AccountEmailKind = "verify" | "existing" | "reset" | "deleted";

const KEYS: Record<AccountEmailKind, { subject: MessageKey; body: MessageKey }> = {
  verify: { subject: "email.verify.subject", body: "email.verify.body" },
  existing: { subject: "email.existing.subject", body: "email.existing.body" },
  reset: { subject: "email.reset.subject", body: "email.reset.body" },
  deleted: { subject: "email.deleted.subject", body: "email.deleted.body" },
};

/**
 * Account e-mails (transactional, never with marketing). Links carry the token in the URL fragment
 * (#t=…), which browsers do not send to servers, so it never lands in access logs.
 */
export function accountEmail(
  kind: AccountEmailKind,
  input: { to: string; name: string; locale: Locale; webUrl: string; token?: string; key: string },
): EmailMessage {
  const base = `${input.webUrl.replace(/\/$/, "")}/${input.locale}`;
  const values = {
    name: input.name,
    link: input.token ? `${base}/${kind === "reset" ? "reset" : "verify"}#t=${input.token}` : "",
    signin: `${base}/signin`,
    forgot: `${base}/forgot`,
  };
  const text = `${t(input.locale, KEYS[kind].body, values)}\n\n${t(input.locale, "email.signoff", { site: base })}`;
  return {
    to: input.to,
    subject: t(input.locale, KEYS[kind].subject),
    text,
    locale: input.locale,
    category: "transactional",
    idempotencyKey: input.key,
  };
}
