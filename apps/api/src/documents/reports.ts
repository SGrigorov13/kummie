import type { CompanySettings } from "@kummie/contracts";
import {
  businessDay,
  centsToDecimal,
  formatDocNumber,
  napAuditXml,
  sofiaDateTime,
  type AuditOrder,
  type AuditRefund,
} from "@kummie/core";
import { and, asc, eq, sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { orders, payments, refunds, salesDocuments } from "../db/schema";
import { orderNumber } from "../shop/basics";

/** Rows whose moment falls in the given month in Sofia. */
const inSofiaMonth = (column: unknown, year: number, month: number) =>
  sql`extract(year from (${column} at time zone 'Europe/Sofia')) = ${year} and extract(month from (${column} at time zone 'Europe/Sofia')) = ${month}`;

/**
 * Monthly standardised audit file (Н-18 Приложение № 38) for the previous month's sales: every
 * чл. 52о document issued in the month, and every refund paid in the month (<rorder>).
 */
export async function napAuditFile(
  db: Database,
  company: CompanySettings,
  webUrl: string,
  year: number,
  month: number,
  now = new Date(),
): Promise<string> {
  const receipts = await db
    .select({ doc: salesDocuments, order: orders })
    .from(salesDocuments)
    .innerJoin(orders, eq(orders.id, salesDocuments.orderId))
    .where(and(eq(salesDocuments.kind, "receipt"), inSofiaMonth(salesDocuments.issuedAt, year, month)))
    .orderBy(asc(salesDocuments.number));
  const auditOrders: AuditOrder[] = await Promise.all(
    receipts.map(async ({ doc, order }) => {
      const [payment] = await db
        .select()
        .from(payments)
        .where(
          and(
            eq(payments.orderId, order.id),
            sql`${payments.status} in ('captured', 'refunded', 'partially_refunded')`,
          ),
        );
      const rate = doc.vatRateBp / 100;
      return {
        orderNumber: doc.snapshot.orderNumber,
        orderDate: businessDay(order.createdAt),
        docNumber: formatDocNumber(doc.number),
        docDate: sofiaDateTime(doc.issuedAt).date,
        lines: doc.snapshot.lines.map((l) => ({
          name: l.name,
          qty: l.qty,
          totalCents: l.totalCents,
          vatCents: l.vatCents,
          vatRatePercent: rate,
        })),
        totalCents: doc.totalCents,
        vatCents: doc.vatCents,
        discountCents: 0,
        // Card payment through the bank's virtual POS terminal (UniCredit vPOS, A6).
        paymentMethod: 2,
        posNumber: payment?.terminalId ?? doc.snapshot.payment.terminalId ?? "",
        transactionRef: payment?.transactionRef ?? doc.snapshot.payment.transactionRef ?? "",
        processorId: "",
      } satisfies AuditOrder;
    }),
  );

  const refundRows = await db
    .select({ refund: refunds, order: orders })
    .from(refunds)
    .innerJoin(orders, eq(orders.id, refunds.orderId))
    .where(and(eq(refunds.status, "succeeded"), inSofiaMonth(refunds.createdAt, year, month)))
    .orderBy(asc(refunds.createdAt));
  const auditRefunds: AuditRefund[] = refundRows.map(({ refund, order }) => ({
    orderNumber: orderNumber(order.seq),
    amountCents: refund.amountCents,
    date: businessDay(refund.createdAt),
    // Back to the card the customer paid with.
    method: 2,
  }));

  return napAuditXml({
    eik: company.eik ?? "",
    eShopNumber: company.napEShopNumber ?? company.napRfNumber ?? "",
    domain: new URL(webUrl).host,
    eShopType: 1,
    creationDate: businessDay(now),
    year,
    month,
    orders: auditOrders,
    refunds: auditRefunds,
  });
}

const csvCell = (value: string | number | null | undefined) => {
  const text = value === null || value === undefined ? "" : String(value);
  return /[;"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
/** Semicolon-separated with a BOM, so Excel with Bulgarian settings opens it correctly. */
export const toCsv = (rows: (string | number | null | undefined)[][]) =>
  `﻿${rows.map((r) => r.map(csvCell).join(";")).join("\r\n")}\r\n`;

const KIND_BG = {
  receipt: "Документ чл. 52о",
  receipt_storno: "Сторно чл. 52о",
  invoice: "Фактура",
  credit_note: "Кредитно известие",
} as const;

/**
 * Every document of the month for the accountant's sales journal (ЗДДС): one row per document with
 * tax base, VAT and total (negative for storno and credit notes), the VAT country and the buyer.
 */
export async function salesJournalCsv(db: Database, year: number, month: number): Promise<string> {
  const rows = await db
    .select({ doc: salesDocuments, order: orders })
    .from(salesDocuments)
    .innerJoin(orders, eq(orders.id, salesDocuments.orderId))
    .where(inSofiaMonth(salesDocuments.issuedAt, year, month))
    .orderBy(asc(salesDocuments.issuedAt), asc(salesDocuments.number));
  return toCsv([
    [
      "Дата",
      "Вид",
      "Номер",
      "Към документ",
      "Поръчка",
      "Държава на доставка",
      "ДДС на държава",
      "Ставка %",
      "Данъчна основа",
      "ДДС",
      "Общо",
      "Получател",
      "ЕИК получател",
      "ДДС № получател",
    ],
    ...rows.map(({ doc, order }) => [
      sofiaDateTime(doc.issuedAt).date,
      KIND_BG[doc.kind],
      formatDocNumber(doc.number),
      doc.snapshot.refersToNumber,
      doc.snapshot.orderNumber,
      order.country,
      doc.snapshot.vatCountry,
      doc.vatRateBp / 100,
      centsToDecimal(doc.totalCents - doc.vatCents),
      centsToDecimal(doc.vatCents),
      centsToDecimal(doc.totalCents),
      doc.snapshot.buyer?.name,
      doc.snapshot.buyer?.eik,
      doc.snapshot.buyer?.vatNumber,
    ]),
  ]);
}

/**
 * Quarterly OSS figures (sales taxed in another EU country, A12): tax base and VAT per country and
 * rate from the чл. 52о documents and their storno, for the OSS return by the end of the next month.
 */
export async function ossQuarterCsv(db: Database, year: number, quarter: number): Promise<string> {
  const months = [1, 2, 3].map((m) => (quarter - 1) * 3 + m);
  const rows = await db
    .select({
      country: sql<string>`${salesDocuments.snapshot}->>'vatCountry'`,
      rateBp: salesDocuments.vatRateBp,
      total: sql<number>`sum(${salesDocuments.totalCents})::int`,
      vat: sql<number>`sum(${salesDocuments.vatCents})::int`,
      count: sql<number>`count(*)::int`,
    })
    .from(salesDocuments)
    .where(
      and(
        sql`${salesDocuments.kind} in ('receipt', 'receipt_storno')`,
        sql`${salesDocuments.snapshot}->>'vatCountry' <> 'BG'`,
        sql`extract(year from (${salesDocuments.issuedAt} at time zone 'Europe/Sofia')) = ${year}`,
        sql`extract(month from (${salesDocuments.issuedAt} at time zone 'Europe/Sofia')) in (${sql.join(months, sql`, `)})`,
      ),
    )
    .groupBy(sql`${salesDocuments.snapshot}->>'vatCountry'`, salesDocuments.vatRateBp)
    .orderBy(sql`1`, sql`2`);
  return toCsv([
    ["Държава", "Ставка %", "Документи", "Данъчна основа", "ДДС", "Общо"],
    ...rows.map((r) => [
      r.country,
      r.rateBp / 100,
      r.count,
      centsToDecimal(r.total - r.vat),
      centsToDecimal(r.vat),
      centsToDecimal(r.total),
    ]),
  ]);
}
