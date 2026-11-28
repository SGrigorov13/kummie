import { ApiRequestError, InvoiceRequest, type AdminOrder } from "@kummie/contracts";
import { useState, type FormEvent } from "react";
import { api, useAdmin } from "./context";

type Kind = "person" | "company";

/** True when the order is paid and has neither an invoice nor a storno (D-067). */
export function canIssueInvoice(order: AdminOrder): boolean {
  const kinds = order.documents.map((d) => d.kind);
  return kinds.includes("receipt") && !kinds.includes("invoice") && !kinds.includes("receipt_storno");
}

/**
 * Admin → Order → "Издай фактура": an invoice the customer asked for after the purchase, also past
 * the customer's own window. Numbered in the invoice series and e-mailed to the customer.
 */
export function IssueInvoice({ order, onIssued }: { order: AdminOrder; onIssued: (o: AdminOrder) => void }) {
  const { t } = useAdmin();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("company");
  const [form, setForm] = useState({ name: "", address: "", eik: "", vatNumber: "" });
  const [message, setMessage] = useState("");

  if (!open) {
    return (
      <div className="row">
        <button type="button" className="btn btn--secondary" onClick={() => setOpen(true)}>
          {t("admin.order.issueInvoice")}
        </button>
        {message ? <span role="status">{message}</span> : null}
      </div>
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const checked = InvoiceRequest.safeParse(
      kind === "person"
        ? { kind, name: form.name, address: form.address }
        : {
            kind,
            name: form.name,
            address: form.address,
            eik: form.eik.trim(),
            vatNumber: form.vatNumber.trim() ? form.vatNumber.trim().toUpperCase() : null,
          },
    );
    if (!checked.success) {
      setMessage(
        t("admin.checkFields", { fields: checked.error.issues.map((i) => i.path.join(".")).join(", ") }),
      );
      return;
    }
    try {
      onIssued(await api.issueInvoice(order.id, checked.data));
      setOpen(false);
      setMessage(t("admin.order.invoiceIssued"));
    } catch (e) {
      setMessage(
        e instanceof ApiRequestError && e.status === 409
          ? t("admin.order.invoiceNotPossible")
          : t("admin.saveFailed", { message: e instanceof Error ? e.message : String(e) }),
      );
    }
  }

  const input = (key: keyof typeof form, label: string) => (
    <div className="field" key={key}>
      <label htmlFor={`late-${key}`}>{label}</label>
      <input
        id={`late-${key}`}
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      />
    </div>
  );

  return (
    <form className="panel stack" onSubmit={submit}>
      <h3>{t("admin.order.issueInvoice")}</h3>
      <p className="note">{t("admin.order.invoiceLead")}</p>
      <div className="row">
        {(["company", "person"] as const).map((k) => (
          <label key={k}>
            <input type="radio" name="late-kind" checked={kind === k} onChange={() => setKind(k)} />{" "}
            {t(k === "person" ? "shop.invoicePerson" : "shop.invoiceCompany")}
          </label>
        ))}
      </div>
      <div className="grid-2">
        {input("name", t("shop.invoiceName"))}
        {input("address", t("shop.invoiceAddress"))}
        {kind === "company" ? input("eik", t("shop.eik")) : null}
        {kind === "company" ? input("vatNumber", t("shop.vatNumber")) : null}
      </div>
      <div className="row">
        <button type="submit" className="btn">
          {t("admin.order.issueInvoice")}
        </button>
        <button type="button" className="btn btn--secondary" onClick={() => setOpen(false)}>
          {t("admin.back")}
        </button>
        {message ? <span role="status">{message}</span> : null}
      </div>
    </form>
  );
}
