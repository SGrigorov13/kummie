/**
 * Sales documents under Наредба Н-18 (alternative regime without a cash register, чл. 52о) and the
 * monthly standardised audit file (Приложение № 38). Pure functions: the API stores and numbers
 * the documents, this module formats them.
 *
 * Status: the XML follows НАП's published sample file; the QR content follows Приложение № 18а as
 * summarised in public sources. Both must be confirmed with the accountant (and the XML validated
 * against НАП's XSD) before real sales — see D-055.
 */

import { addDays } from "./kummies";

export const MAX_DOC_NUMBER = 9_999_999_999;

/** Document numbers are 10 digits, ascending by one, without gaps (Н-18 чл. 52о; ЗДДС for invoices). */
export function formatDocNumber(value: number): string {
  if (!Number.isInteger(value) || value < 1 || value > MAX_DOC_NUMBER) {
    throw new Error(`Invalid document number ${value}`);
  }
  return String(value).padStart(10, "0");
}

/**
 * A number range for one series (set by the accountant so the platform's documents never share a
 * number with those from the accounting program): whole numbers, 10 digits at most, first ≤ last.
 */
export function isValidNumberRange(first: number, last: number): boolean {
  return (
    Number.isInteger(first) && Number.isInteger(last) && first >= 1 && last <= MAX_DOC_NUMBER && first <= last
  );
}

/**
 * Last day (Sofia) on which a customer may still ask for an invoice for a sale paid on `paidDay`
 * (ЗДДС чл. 113, ал. 4: an invoice within 5 days of the tax event; the number of days is a setting).
 */
export function invoiceRequestUntil(paidDay: string, days: number): string {
  return addDays(paidDay, days);
}

/** Integer cents → "24.96" (point, two decimals, minus sign when negative). */
export function centsToDecimal(cents: number): string {
  if (!Number.isInteger(cents)) throw new Error(`Money must be integer cents, got ${cents}`);
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Date and time of a moment in Sofia, as used on the documents ("2026-11-16", "14:05:09"). */
export function sofiaDateTime(moment: Date): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Sofia",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(moment);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}:${get("second")}`,
  };
}

export type ReceiptQrInput = {
  /** Number НАП gave the e-shop (Приложение № 33): RF… / E_SHOP_N. */
  eShopNumber: string;
  issuedAt: Date;
  /** Virtual POS terminal of the payment. */
  posNumber: string;
  /** Authorisation code of the card transaction. */
  authCode: string;
  totalCents: number;
  /** Unique customer order number in the shop (KUM-1001). */
  orderNumber: string;
};

/**
 * QR content of the чл. 52о document (Приложение № 18а): shop number from НАП, date and time of the
 * sale, vPOS number, authorisation code, amount and order number, separated by "*".
 * TO CONFIRM with the accountant before go-live (field order and separator).
 */
export function receiptQrContent(input: ReceiptQrInput): string {
  const { date, time } = sofiaDateTime(input.issuedAt);
  return [
    input.eShopNumber,
    date,
    time,
    input.posNumber,
    input.authCode,
    centsToDecimal(input.totalCents),
    input.orderNumber,
  ].join("*");
}

// ---------- Monthly audit file (Приложение № 38) ----------

export type AuditLine = {
  name: string;
  qty: number;
  /** Line total incl. VAT, and the VAT inside it (cents). */
  totalCents: number;
  vatCents: number;
  /** e.g. 20 for 20 %. */
  vatRatePercent: number;
};

export type AuditOrder = {
  orderNumber: string;
  orderDate: string;
  docNumber: string;
  docDate: string;
  lines: AuditLine[];
  totalCents: number;
  vatCents: number;
  discountCents: number;
  /** 1 exempt (чл. 3), 2 virtual POS, 3 cash on delivery via ППП, 4 payment service provider, 5 other. */
  paymentMethod: 1 | 2 | 3 | 4 | 5;
  posNumber: string;
  transactionRef: string;
  /** ЕИК / VAT number of a payment service provider (method 4). */
  processorId: string;
};

export type AuditRefund = {
  orderNumber: string;
  amountCents: number;
  date: string;
  /** 1 payment account, 2 card, 3 cash, 4 other. */
  method: 1 | 2 | 3 | 4;
};

export type AuditFile = {
  eik: string;
  eShopNumber: string;
  /** Web address of the shop, e.g. kummie.eu. */
  domain: string;
  /** 1 own domain, 2 marketplace. */
  eShopType: 1 | 2;
  creationDate: string;
  year: number;
  month: number;
  orders: AuditOrder[];
  refunds: AuditRefund[];
};

const xmlEscape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c] ?? c,
  );

/** Unit price without VAT for the file: (line total − VAT) / quantity, rounded to cents. */
function unitNetCents(line: AuditLine): number {
  return Math.round((line.totalCents - line.vatCents) / line.qty);
}

/**
 * The standardised audit file for one calendar month, in the structure of НАП's sample:
 * <audit> with the shop header, <order><orderenum>… per document, then the refunds in <rorder>.
 * Amounts in euro (since 01.01.2026). Encode the result with `toWindows1251` before saving.
 */
export function napAuditXml(file: AuditFile): string {
  const tag = (name: string, value: string | number) => `<${name}>${xmlEscape(String(value))}</${name}>`;
  const orders = file.orders
    .map((o) => {
      const arts = o.lines
        .map((l) =>
          [
            "<artenum>",
            tag("art_name", l.name.slice(0, 200)),
            tag("art_quant", l.qty),
            tag("art_price", centsToDecimal(unitNetCents(l))),
            tag("art_vat_rate", l.vatRatePercent),
            tag("art_vat", centsToDecimal(l.vatCents)),
            tag("art_sum", centsToDecimal(l.totalCents)),
            "</artenum>",
          ].join("\n"),
        )
        .join("\n");
      return [
        "<orderenum>",
        tag("ord_n", o.orderNumber),
        tag("ord_d", o.orderDate),
        tag("doc_n", o.docNumber),
        tag("doc_date", o.docDate),
        "<art>",
        arts,
        "</art>",
        tag("ord_total1", centsToDecimal(o.totalCents - o.vatCents)),
        tag("ord_disc", centsToDecimal(o.discountCents)),
        tag("ord_vat", centsToDecimal(o.vatCents)),
        tag("ord_total2", centsToDecimal(o.totalCents)),
        tag("paym", o.paymentMethod),
        tag("pos_n", o.posNumber),
        tag("trans_n", o.transactionRef),
        tag("proc_id", o.processorId),
        "</orderenum>",
      ].join("\n");
    })
    .join("\n");
  const refunds = file.refunds
    .map((r) =>
      [
        "<rorderenum>",
        tag("r_ord_n", r.orderNumber),
        tag("r_amount", centsToDecimal(r.amountCents)),
        tag("r_date", r.date),
        tag("r_paym", r.method),
        "</rorderenum>",
      ].join("\n"),
    )
    .join("\n");
  const refundTotal = file.refunds.reduce((sum, r) => sum + r.amountCents, 0);
  return [
    '<?xml version="1.0" encoding="windows-1251"?>',
    "<audit>",
    tag("eik", file.eik),
    tag("e_shop_n", file.eShopNumber),
    tag("domain_name", file.domain),
    tag("e_shop_type", file.eShopType),
    tag("creation_date", file.creationDate),
    tag("mon", String(file.month).padStart(2, "0")),
    tag("god", file.year),
    "<order>",
    ...(orders ? [orders] : []),
    "</order>",
    tag("r_ord", file.refunds.length),
    "<rorder>",
    ...(refunds ? [refunds] : []),
    "</rorder>",
    tag("r_total", centsToDecimal(refundTotal)),
    "</audit>",
    "",
  ].join("\n");
}

/** Characters of windows-1251 outside ASCII and the Cyrillic block (А–я = 0xC0–0xFF). */
const CP1251_EXTRA: Record<string, number> = {
  Ё: 0xa8,
  ё: 0xb8,
  Ѝ: 0x3f,
  ѝ: 0x3f,
  "„": 0x84,
  "“": 0x93,
  "”": 0x94,
  "–": 0x96,
  "—": 0x97,
  "€": 0x88,
  "«": 0xab,
  "»": 0xbb,
  "№": 0xb9,
  " ": 0xa0,
  "…": 0x85,
  "’": 0x92,
  "‘": 0x91,
  "•": 0x95,
  "°": 0xb0,
  "©": 0xa9,
  "®": 0xae,
  "™": 0x99,
};

/** Encodes text as windows-1251 (the encoding of НАП's sample file); unknown characters become "?". */
export function toWindows1251(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  let i = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0x3f;
    if (code < 0x80) out[i] = code;
    else if (code >= 0x410 && code <= 0x44f) out[i] = code - 0x410 + 0xc0;
    else out[i] = CP1251_EXTRA[ch] ?? 0x3f;
    i += 1;
  }
  return out.subarray(0, i);
}
