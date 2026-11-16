import { inArray } from "drizzle-orm";
import type { Database } from "../db/client";
import { salesDocuments } from "../db/schema";
import { documentFileName, renderDocumentPdf } from "./pdf";

const KIND_ORDER = { receipt: 0, receipt_storno: 1, invoice: 2, credit_note: 3 } as const;

/** PDFs of the given documents, for an e-mail (rendered from the frozen snapshots). */
export async function documentAttachments(
  db: Database,
  ids: readonly string[],
): Promise<{ filename: string; content: Uint8Array; contentType: string }[]> {
  if (ids.length === 0) return [];
  const docs = await db
    .select()
    .from(salesDocuments)
    .where(inArray(salesDocuments.id, [...ids]));
  return Promise.all(
    docs
      // The чл. 52о document (or its storno) first, then the invoice (or credit note).
      .toSorted((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.number - b.number)
      .map(async (doc) => ({
        filename: documentFileName(doc),
        content: await renderDocumentPdf(doc),
        contentType: "application/pdf",
      })),
  );
}
