import { createRequire } from "node:module";
import { formatDocNumber, sofiaDateTime } from "@kummie/core";
import PdfKit from "pdfkit";
import QRCode from "qrcode";
import type { DocumentRow } from "./issue";

const require = createRequire(import.meta.url);
/** DejaVu Sans: free font with Latin and Cyrillic (the brand web fonts ship as subsets only). */
const FONT_REGULAR = require.resolve("dejavu-fonts-ttf/ttf/DejaVuSans.ttf");
const FONT_BOLD = require.resolve("dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf");

const TITLES: Record<DocumentRow["kind"], string> = {
  receipt: "Документ за продажба по чл. 52о от Наредба № Н-18",
  receipt_storno: "Сторно документ по чл. 52о от Наредба № Н-18",
  invoice: "ФАКТУРА — ОРИГИНАЛ",
  credit_note: "КРЕДИТНО ИЗВЕСТИЕ — ОРИГИНАЛ",
};

/** File name for downloads and e-mail attachments (ASCII only). */
export function documentFileName(doc: Pick<DocumentRow, "kind" | "number">): string {
  const name = {
    receipt: "dokument",
    receipt_storno: "storno",
    invoice: "faktura",
    credit_note: "kreditno-izvestie",
  }[doc.kind];
  return `kummie-${name}-${formatDocNumber(doc.number)}.pdf`;
}

/** "48,90 €" in Bulgarian notation, with the minus sign for storno amounts. */
function eur(cents: number): string {
  const sign = cents < 0 ? "−" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")} €`;
}

/**
 * Renders a sales document as A4 PDF from its frozen snapshot, so the same document always prints
 * the same. Labels are in Bulgarian (ЗДДС requires Bulgarian invoices).
 */
export async function renderDocumentPdf(doc: DocumentRow): Promise<Buffer> {
  const s = doc.snapshot;
  const qrPng = s.qr
    ? await QRCode.toBuffer(s.qr, { type: "png", margin: 1, width: 150, errorCorrectionLevel: "M" })
    : null;
  const pdf = new PdfKit({
    size: "A4",
    margin: 48,
    info: {
      Title: `${TITLES[doc.kind]} ${formatDocNumber(doc.number)}`,
      Author: s.seller.legalName ?? "KUMMIE",
    },
  });
  pdf.registerFont("regular", FONT_REGULAR);
  pdf.registerFont("bold", FONT_BOLD);
  const chunks: Buffer[] = [];
  pdf.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);
  });

  const { date, time } = sofiaDateTime(doc.issuedAt);
  const left = 48;
  const width = pdf.page.width - 96;

  pdf.font("bold").fontSize(18).fillColor("#2D0075").text("KUMMIE", left, 48);
  pdf.font("bold").fontSize(13).fillColor("#000000").text(TITLES[doc.kind], left, 80, { width });
  pdf
    .font("regular")
    .fontSize(10)
    .text(`№ ${formatDocNumber(doc.number)}    Дата: ${date}    Час: ${time}`, { width });
  if (s.refersToNumber) {
    const ref = doc.kind === "credit_note" ? "към фактура" : "към документ";
    pdf.text(`${ref} № ${s.refersToNumber}`, { width });
  }
  pdf.text(`Поръчка: ${s.orderNumber} от ${s.orderDate}`, { width });
  pdf.moveDown(0.8);

  // Seller and (for invoices) buyer, side by side.
  const top = pdf.y;
  const half = width / 2 - 8;
  const seller = [
    s.seller.legalName ?? "—",
    s.seller.eik ? `ЕИК: ${s.seller.eik}` : null,
    s.seller.vatNumber ? `ДДС №: ${s.seller.vatNumber}` : null,
    s.seller.address ? `Адрес: ${s.seller.address}` : null,
    s.seller.email,
    s.seller.eShopNumber ? `Електронен магазин (НАП): ${s.seller.eShopNumber}` : null,
  ].filter(Boolean);
  pdf
    .font("bold")
    .text(doc.kind === "invoice" || doc.kind === "credit_note" ? "Доставчик" : "Търговец", left, top, {
      width: half,
    });
  pdf.font("regular").text(seller.join("\n"), { width: half });
  const afterSeller = pdf.y;
  if (s.buyer) {
    const buyer = [
      s.buyer.name,
      s.buyer.eik ? `ЕИК: ${s.buyer.eik}` : null,
      s.buyer.vatNumber ? `ДДС №: ${s.buyer.vatNumber}` : null,
      `Адрес: ${s.buyer.address}`,
    ].filter(Boolean);
    pdf.font("bold").text("Получател", left + half + 16, top, { width: half });
    pdf.font("regular").text(buyer.join("\n"), { width: half });
  }
  pdf.y = Math.max(afterSeller, pdf.y) + 14;

  // Lines.
  const cols = [left, left + 22, left + 226, left + 262, left + 342, left + 422];
  // Invoices and credit notes show prices without VAT (ЗДДС чл. 114); the чл. 52о document shows
  // the consumer prices the customer paid, with the VAT inside them.
  const invoiceLike = doc.kind === "invoice" || doc.kind === "credit_note";
  const header = invoiceLike
    ? ["№", "Наименование", "К-во", "Ед. цена без ДДС", "Стойност без ДДС", "ДДС"]
    : ["№", "Наименование", "К-во", "Ед. цена", "Стойност", "в т.ч. ДДС"];
  pdf.font("bold").fontSize(9);
  const headerY = pdf.y;
  const colWidth = (i: number) => (cols[i + 1] ?? left + width) - (cols[i] ?? left) - 4;
  // The header row is as tall as its tallest (wrapped) cell.
  const headerHeight = Math.max(...header.map((h, i) => pdf.heightOfString(h, { width: colWidth(i) })));
  header.forEach((h, i) => pdf.text(h, cols[i] ?? left, headerY, { width: colWidth(i) }));
  pdf
    .moveTo(left, headerY + headerHeight + 2)
    .lineTo(left + width, headerY + headerHeight + 2)
    .strokeColor("#999999")
    .stroke();
  pdf.font("regular");
  let y = headerY + headerHeight + 8;
  s.lines.forEach((line, index) => {
    const cells = [
      String(index + 1),
      line.name,
      String(line.qty),
      eur(invoiceLike ? Math.round((line.totalCents - line.vatCents) / line.qty) : line.unitPriceCents),
      eur(invoiceLike ? line.totalCents - line.vatCents : line.totalCents),
      eur(line.vatCents),
    ];
    const heights = cells.map((c, i) =>
      pdf.heightOfString(c, { width: (cols[i + 1] ?? left + width) - (cols[i] ?? left) - 4 }),
    );
    cells.forEach((c, i) =>
      pdf.text(c, cols[i] ?? left, y, { width: (cols[i + 1] ?? left + width) - (cols[i] ?? left) - 4 }),
    );
    y += Math.max(...heights) + 4;
  });
  pdf
    .moveTo(left, y)
    .lineTo(left + width, y)
    .stroke();
  y += 8;

  // Totals per VAT rate (one rate per order).
  const rate = doc.vatRateBp / 100;
  const totals: [string, string][] = [
    [`Данъчна основа (${rate}% ДДС)`, eur(doc.totalCents - doc.vatCents)],
    [`ДДС ${rate}%`, eur(doc.vatCents)],
    ["Обща сума", eur(doc.totalCents)],
  ];
  pdf.fontSize(10);
  for (const [label, value] of totals) {
    pdf.font(label === "Обща сума" ? "bold" : "regular").text(label, left + 250, y, { width: 150 });
    pdf.text(value, left + 400, y, { width: width - 400, align: "right" });
    y += 16;
  }
  if (s.vatCountry !== "BG") {
    pdf
      .font("regular")
      .fontSize(9)
      .text(`ДДС на държавата на доставка: ${s.vatCountry} (режим OSS)`, left + 250, y, { width: 250 });
    y += 14;
  }
  y += 6;

  // Payment.
  pdf.font("bold").fontSize(10).text("Плащане", left, y);
  const paymentLines = [
    doc.kind === "receipt_storno" || doc.kind === "credit_note"
      ? "Връщане по картата, с която е платено"
      : "С банкова карта през виртуален ПОС терминал",
    s.payment.terminalId ? `Терминал (ПОС): ${s.payment.terminalId}` : null,
    s.payment.authCode ? `Авторизационен код: ${s.payment.authCode}` : null,
    s.payment.transactionRef ? `Референция на трансакцията: ${s.payment.transactionRef}` : null,
  ].filter(Boolean);
  pdf.font("regular").fontSize(9).text(paymentLines.join("\n"), left, pdf.y, { width: 300 });

  if (doc.kind === "invoice" || doc.kind === "credit_note") {
    pdf.moveDown(0.6);
    pdf.text(`Дата на данъчното събитие: ${date}`, { width: 300 });
    if (doc.kind === "credit_note")
      pdf.text("Основание: връщане на сумата при отказ от поръчката", { width: 300 });
  }

  if (qrPng) pdf.image(qrPng, left + width - 130, y, { width: 130 });

  pdf
    .fontSize(8)
    .fillColor("#555555")
    .text("Документът е издаден електронно и е валиден без подпис и печат.", left, pdf.page.height - 80, {
      width,
      align: "center",
    });
  pdf.end();
  return done;
}
