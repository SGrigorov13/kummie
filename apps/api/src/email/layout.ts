import { colors } from "@kummie/brand";
import type { CompanySettings } from "@kummie/contracts";
import { t, type Locale } from "@kummie/i18n";

/** Optional main action shown as a button (the same link stays in the text for plain-text readers). */
export type EmailCta = { label: string; url: string };

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );

/** Only our own http(s) links become clickable; everything else stays text. */
const URL_PATTERN = /https?:\/\/[^\s<>"']+/g;

function linkify(escaped: string): string {
  return escaped.replace(URL_PATTERN, (url) => {
    const display = url.replace(/#.*$/, "");
    return `<a href="${url}" style="color:${colors.violet};text-decoration:underline;word-break:break-all">${display}</a>`;
  });
}

/** Company line for the footer (A4: trader data comes from Admin → Фирма, never from code). */
export function companyFooter(company: CompanySettings | null, locale: Locale): string[] {
  if (!company?.legalName) return ["KUMMIE"];
  const parts = [
    company.legalName,
    company.eik ? `${locale === "bg" ? "ЕИК" : "Company ID"} ${company.eik}` : null,
    company.vatNumber,
    company.registeredAddress,
  ].filter((p): p is string => !!p);
  const contact = [company.contactEmail, company.contactPhone].filter((p): p is string => !!p);
  return [parts.join(" · "), ...(contact.length > 0 ? [contact.join(" · ")] : [])];
}

/**
 * Plain text → branded HTML e-mail. Copy stays in `@kummie/i18n` as plain text (paragraphs split by
 * an empty line); this only wraps it: violet header with the wordmark, Paper body, a Glow button
 * (never pink — CLAUDE.md brand rules), the trader footer and the "service e-mail" note.
 * No images, no tracking pixels, no external fonts — works in every client and stays private.
 */
export function renderEmailHtml(input: {
  locale: Locale;
  subject: string;
  text: string;
  cta?: EmailCta | undefined;
  company: CompanySettings | null;
}): string {
  const { locale, subject, text, cta, company } = input;
  const blocks = text.trim().split(/\n{2,}/);
  // The button goes right after the paragraph that carries its link (else after the last one).
  const ctaIndex = cta ? blocks.findIndex((block) => block.includes(cta.url)) : -1;
  const at = ctaIndex >= 0 ? ctaIndex : blocks.length - 1;
  const paragraph = (block: string) =>
    `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:${colors.ink}">${linkify(escapeHtml(block)).replace(/\n/g, "<br>")}</p>`;
  const button = cta
    ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0 24px"><tr><td style="border-radius:999px;background:${colors.glow}">
<a href="${escapeHtml(cta.url)}" style="display:inline-block;padding:14px 28px;font-weight:700;font-size:16px;color:${colors.ink};text-decoration:none;border-radius:999px;border:2px solid ${colors.ink}">${escapeHtml(cta.label)}</a>
</td></tr></table>`
    : "";
  const body = blocks.map((block, i) => paragraph(block) + (i === at ? `\n${button}` : "")).join("\n");
  const footer = companyFooter(company, locale)
    .map((line) => `<p style="margin:0 0 6px">${escapeHtml(line)}</p>`)
    .join("");
  const font = "Onest, 'Segoe UI', Arial, Helvetica, sans-serif";

  return `<!doctype html>
<html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:${colors.paper};font-family:${font}">
<div style="display:none;max-height:0;overflow:hidden">${escapeHtml(subject)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${colors.paper}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background:${colors.white};border-radius:16px;overflow:hidden;border:1px solid ${colors.hairline}">
<tr><td style="background:${colors.violet};padding:20px 28px">
<span style="font-family:Montserrat,'Arial Black',Arial,sans-serif;font-weight:900;font-size:26px;letter-spacing:-0.5px;color:${colors.white}">KUMMIE</span>
<span style="display:block;font-family:'JetBrains Mono',Consolas,monospace;font-size:11px;letter-spacing:2px;color:${colors.glow};text-transform:uppercase">Your K-pop Chingu</span>
</td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 20px;font-family:Montserrat,'Arial Black',Arial,sans-serif;font-weight:900;font-size:22px;line-height:1.25;color:${colors.ink}">${escapeHtml(subject)}</h1>
${body}
</td></tr>
<tr><td style="padding:20px 28px;background:${colors.paper};font-size:13px;line-height:1.5;color:${colors.bodyMuted}">
${footer}
<p style="margin:12px 0 0">${escapeHtml(t(locale, "email.serviceNote"))}</p>
</td></tr>
</table></td></tr></table></body></html>`;
}
