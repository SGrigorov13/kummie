import type { CompanySettings, InvoiceRequest } from "@kummie/contracts";
import { businessDay, MAX_DOC_NUMBER, receiptQrContent } from "@kummie/core";
import { and, eq, inArray, sql } from "drizzle-orm";
import { documentSequences, orderLines, orders, salesDocuments, type DocumentSnapshot } from "../db/schema";
import { orderNumber, type OrderRow, type Tx } from "../shop/basics";

export type DocumentRow = typeof salesDocuments.$inferSelect;
type PaymentInfo = { terminalId: string | null; authCode: string | null; transactionRef: string | null };

export type DocumentSeries = "receipt" | "invoice";

/** The series' range is used up: no document can be issued until the accountant sets a new one. */
export class NumberRangeExhausted extends Error {
  constructor(readonly series: DocumentSeries) {
    super(`The ${series} number range is used up`);
    this.name = "NumberRangeExhausted";
  }
}

/**
 * Next number of a series, inside the caller's transaction. The upsert locks the series row until
 * commit, so numbers are unique and — because a rolled-back transaction releases its number —
 * without gaps (Н-18 чл. 52о: ascending by one; ЗДДС: invoices in one unbroken series). A number
 * past the range's end is never issued (D-067): the whole transaction fails instead.
 */
export async function nextDocumentNumber(tx: Tx, series: DocumentSeries): Promise<number> {
  const [row] = await tx
    .insert(documentSequences)
    .values({ series, lastNumber: 1 })
    .onConflictDoUpdate({
      target: documentSequences.series,
      set: { lastNumber: sql`${documentSequences.lastNumber} + 1` },
    })
    .returning({ number: documentSequences.lastNumber, endNumber: documentSequences.endNumber });
  if (!row) throw new Error("no document number");
  if (row.number > (row.endNumber ?? MAX_DOC_NUMBER)) throw new NumberRangeExhausted(series);
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

function buyerOf(invoice: InvoiceRequest): NonNullable<DocumentSnapshot["buyer"]> {
  return invoice.kind === "company"
    ? {
        kind: "company",
        name: invoice.name,
        address: invoice.address,
        eik: invoice.eik,
        vatNumber: invoice.vatNumber,
      }
    : { kind: "person", name: invoice.name, address: invoice.address };
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
    const buyer = buyerOf(order.invoice);
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

export class InvoiceNotPossible extends Error {
  constructor(readonly code: "not_paid" | "already_invoiced" | "refunded") {
    super(
      code === "not_paid"
        ? "The order has no sales document yet"
        : code === "already_invoiced"
          ? "The order already has an invoice"
          : "The sale was refunded",
    );
    this.name = "InvoiceNotPossible";
  }
}

/**
 * An invoice asked for after the payment (D-067): same lines, amounts and payment as the чл. 52о
 * document, the buyer's data from the request, the next number of the invoice series, and the sale
 * day printed as the tax event date. The request is stored on the order as well.
 */
export async function issueLateInvoice(
  tx: Tx,
  order: OrderRow,
  request: InvoiceRequest,
  company: CompanySettings,
  issuedAt = new Date(),
): Promise<DocumentRow> {
  const docs = await tx.select().from(salesDocuments).where(eq(salesDocuments.orderId, order.id));
  const receipt = docs.find((d) => d.kind === "receipt");
  if (!receipt) throw new InvoiceNotPossible("not_paid");
  if (docs.some((d) => d.kind === "invoice")) throw new InvoiceNotPossible("already_invoiced");
  if (docs.some((d) => d.kind === "receipt_storno")) throw new InvoiceNotPossible("refunded");

  const number = await nextDocumentNumber(tx, "invoice");
  const [invoice] = await tx
    .insert(salesDocuments)
    .values({
      orderId: order.id,
      kind: "invoice",
      series: "invoice",
      number,
      issuedAt,
      totalCents: receipt.totalCents,
      vatCents: receipt.vatCents,
      vatRateBp: receipt.vatRateBp,
      snapshot: {
        ...receipt.snapshot,
        seller: sellerOf(company),
        buyer: buyerOf(request),
        qr: null,
        refersToNumber: null,
        taxEventDate: businessDay(receipt.issuedAt),
      },
    })
    .returning();
  if (!invoice) throw new Error("invoice not stored");
  await tx.update(orders).set({ invoice: request }).where(eq(orders.id, order.id));
  return invoice;
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
          taxEventDate: null,
        },
      })
      .returning();
    if (doc) issued.push(doc);
  }
  return issued;
}

/**
 * On a partial refund (missing or damaged units, D-064): a storno of the receipt and, if there was
 * an invoice, a credit note — only for the refunded lines (negative amounts), with the reason.
 */
export async function issuePartialRefundDocuments(
  tx: Tx,
  order: OrderRow,
  refundId: string,
  lines: DocumentSnapshot["lines"],
  reason: string,
  issuedAt = new Date(),
): Promise<DocumentRow[]> {
  const originals = await tx
    .select()
    .from(salesDocuments)
    .where(and(eq(salesDocuments.orderId, order.id), inArray(salesDocuments.kind, ["receipt", "invoice"])));
  const totalCents = lines.reduce((sum, l) => sum + l.totalCents, 0);
  const vatCents = lines.reduce((sum, l) => sum + l.vatCents, 0);
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
        totalCents,
        vatCents,
        vatRateBp: original.vatRateBp,
        snapshot: {
          ...original.snapshot,
          lines,
          qr: null,
          refersToNumber: String(original.number).padStart(10, "0"),
          taxEventDate: null,
          reason,
        },
      })
      .returning();
    if (doc) issued.push(doc);
  }
  return issued;
}
