import type { CompanySettings } from "@kummie/contracts";
import { businessDay, receiptQrContent } from "@kummie/core";
import { and, eq, inArray, sql } from "drizzle-orm";
import { documentSequences, orderLines, salesDocuments, type DocumentSnapshot } from "../db/schema";
import { orderNumber, type OrderRow, type Tx } from "../shop/basics";

export type DocumentRow = typeof salesDocuments.$inferSelect;
type PaymentInfo = { terminalId: string | null; authCode: string | null; transactionRef: string | null };

/**
 * Next number of a series, inside the caller's transaction. The upsert locks the series row until
 * commit, so numbers are unique and — because a rolled-back transaction releases its number —
 * without gaps (Н-18 чл. 52о: ascending by one; ЗДДС: invoices in one unbroken series).
 */
export async function nextDocumentNumber(tx: Tx, series: "receipt" | "invoice"): Promise<number> {
  const [row] = await tx
    .insert(documentSequences)
    .values({ series, lastNumber: 1 })
    .onConflictDoUpdate({
      target: documentSequences.series,
      set: { lastNumber: sql`${documentSequences.lastNumber} + 1` },
    })
    .returning({ number: documentSequences.lastNumber });
  if (!row) throw new Error("no document number");
  return row.number;
}

function sellerOf(company: CompanySettings): DocumentSnapshot["seller"] {
  return {
    legalName: company.legalName,
    eik: company.eik,
    vatNumber: company.vatNumber,
    address: company.registeredAddress,
    email: company.contactEmail,
    eShopNumber: company.napRfNumber ?? company.napEShopNumber,
  };
}

/** Document lines: the goods plus delivery (when charged), with the order's frozen VAT shares. */
async function linesOf(tx: Tx, order: OrderRow): Promise<DocumentSnapshot["lines"]> {
  const rows = await tx
    .select()
    .from(orderLines)
    .where(eq(orderLines.orderId, order.id))
    .orderBy(orderLines.position);
  const lines = rows.map((l) => ({
    name: `${l.title} (${l.version})`,
    qty: l.qty,
    unitPriceCents: l.unitPriceCents,
    totalCents: l.lineTotalCents,
    vatCents: l.vatCents,
  }));
  if (order.shippingCents > 0) {
    lines.push({
      name: "Доставка",
      qty: 1,
      unitPriceCents: order.shippingCents,
      totalCents: order.shippingCents,
      vatCents: order.shippingVatCents,
    });
  }
  return lines;
}

/**
 * On payment: the чл. 52о document (always) and an invoice when the customer asked for one (A14).
 * Runs inside the payment transaction, so a payment never exists without its document.
 */
export async function issueSaleDocuments(
  tx: Tx,
  order: OrderRow,
  payment: PaymentInfo,
  company: CompanySettings,
  issuedAt = new Date(),
): Promise<DocumentRow[]> {
  const existing = await tx
    .select()
    .from(salesDocuments)
    .where(and(eq(salesDocuments.orderId, order.id), inArray(salesDocuments.kind, ["receipt", "invoice"])));
  if (existing.length > 0) return existing;

  const seller = sellerOf(company);
  const lines = await linesOf(tx, order);
  const number = orderNumber(order.seq);
  const base: Omit<DocumentSnapshot, "buyer" | "qr" | "refersToNumber"> = {
    seller,
    lines,
    payment: { method: "card_vpos", ...payment },
    orderNumber: number,
    orderDate: businessDay(order.createdAt),
    vatCountry: order.vatCountry,
  };
  const issued: DocumentRow[] = [];

  const receiptNumber = await nextDocumentNumber(tx, "receipt");
  const qr = receiptQrContent({
    eShopNumber: seller.eShopNumber ?? "",
    issuedAt,
    posNumber: payment.terminalId ?? "",
    authCode: payment.authCode ?? "",
    totalCents: order.totalCents,
    orderNumber: number,
  });
  const [receipt] = await tx
    .insert(salesDocuments)
    .values({
      orderId: order.id,
      kind: "receipt",
      series: "receipt",
      number: receiptNumber,
      issuedAt,
      totalCents: order.totalCents,
      vatCents: order.vatCents,
      vatRateBp: order.vatRateBp,
      snapshot: { ...base, buyer: null, qr, refersToNumber: null },
    })
    .returning();
  if (receipt) issued.push(receipt);

  if (order.invoice) {
    const invoiceNumber = await nextDocumentNumber(tx, "invoice");
    const buyer: DocumentSnapshot["buyer"] =
      order.invoice.kind === "company"
        ? {
            kind: "company",
            name: order.invoice.name,
            address: order.invoice.address,
            eik: order.invoice.eik,
            vatNumber: order.invoice.vatNumber,
          }
        : { kind: "person", name: order.invoice.name, address: order.invoice.address };
    const [invoice] = await tx
      .insert(salesDocuments)
      .values({
        orderId: order.id,
        kind: "invoice",
        series: "invoice",
        number: invoiceNumber,
        issuedAt,
        totalCents: order.totalCents,
        vatCents: order.vatCents,
        vatRateBp: order.vatRateBp,
        snapshot: { ...base, buyer, qr: null, refersToNumber: null },
      })
      .returning();
    if (invoice) issued.push(invoice);
  }
  return issued;
}

/**
 * On a full refund: a storno of the receipt and, if there was an invoice, a credit note — both
 * with negative amounts and a reference to the original document.
 */
export async function issueRefundDocuments(
  tx: Tx,
  order: OrderRow,
  refundId: string,
  issuedAt = new Date(),
): Promise<DocumentRow[]> {
  const originals = await tx
    .select()
    .from(salesDocuments)
    .where(and(eq(salesDocuments.orderId, order.id), inArray(salesDocuments.kind, ["receipt", "invoice"])));
  const issued: DocumentRow[] = [];
  for (const original of originals) {
    const series = original.kind === "receipt" ? "receipt" : "invoice";
    const kind = original.kind === "receipt" ? "receipt_storno" : "credit_note";
    const number = await nextDocumentNumber(tx, series);
    const [doc] = await tx
      .insert(salesDocuments)
      .values({
        orderId: order.id,
        kind,
        series,
        number,
        issuedAt,
        refersToId: original.id,
        refundId,
        totalCents: -original.totalCents,
        vatCents: -original.vatCents,
        vatRateBp: original.vatRateBp,
        snapshot: {
          ...original.snapshot,
          lines: original.snapshot.lines.map((l) => ({
            ...l,
            totalCents: -l.totalCents,
            vatCents: -l.vatCents,
          })),
          qr: null,
          refersToNumber: String(original.number).padStart(10, "0"),
        },
      })
      .returning();
    if (doc) issued.push(doc);
  }
  return issued;
}
