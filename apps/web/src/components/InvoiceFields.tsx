"use client";

import type { InvoiceRequest } from "@kummie/contracts";
import { useT } from "@/lib/locale";
import { Field } from "./Field";

export type InvoiceKind = "person" | "company";
export type InvoiceDraft = { name: string; address: string; eik: string; vatNumber: string };
export const EMPTY_INVOICE: InvoiceDraft = { name: "", address: "", eik: "", vatNumber: "" };

/** The request sent to the API (A14): an individual without ЕГН, or a Bulgarian company. */
export function toInvoiceRequest(kind: InvoiceKind, draft: InvoiceDraft): InvoiceRequest {
  if (kind === "person") return { kind: "person", name: draft.name, address: draft.address };
  return {
    kind: "company",
    name: draft.name,
    address: draft.address,
    eik: draft.eik.trim(),
    vatNumber: draft.vatNumber.trim() ? draft.vatNumber.trim().toUpperCase() : null,
  };
}

/** Name and address, plus ЕИК and VAT number for a company — at checkout and after the sale. */
export function InvoiceFields({
  kind,
  draft,
  onChange,
  idPrefix = "inv",
}: {
  kind: InvoiceKind;
  draft: InvoiceDraft;
  onChange: (draft: InvoiceDraft) => void;
  idPrefix?: string;
}) {
  const t = useT();
  return (
    <>
      <Field
        id={`${idPrefix}-name`}
        label={t("shop.invoiceName")}
        required
        value={draft.name}
        onChange={(e) => onChange({ ...draft, name: e.target.value })}
      />
      <Field
        id={`${idPrefix}-address`}
        label={t("shop.invoiceAddress")}
        required
        minLength={3}
        value={draft.address}
        onChange={(e) => onChange({ ...draft, address: e.target.value })}
      />
      {kind === "company" ? (
        <>
          <Field
            id={`${idPrefix}-eik`}
            label={t("shop.eik")}
            required
            inputMode="numeric"
            pattern="\d{9}|\d{13}"
            value={draft.eik}
            onChange={(e) => onChange({ ...draft, eik: e.target.value })}
          />
          <Field
            id={`${idPrefix}-vat`}
            label={t("shop.vatNumber")}
            pattern="BG\d{9,10}"
            value={draft.vatNumber}
            onChange={(e) => onChange({ ...draft, vatNumber: e.target.value })}
          />
        </>
      ) : null}
    </>
  );
}
