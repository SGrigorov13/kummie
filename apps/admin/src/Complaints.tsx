import {
  ApiRequestError,
  StaffComplaintInput,
  type Complaint,
  type ComplaintDemand,
} from "@kummie/contracts";
import { useEffect, useState, type FormEvent } from "react";
import { api, useAdmin } from "./context";

const DEMANDS: ComplaintDemand[] = ["repair", "replacement", "price_reduction", "refund"];
const CHANNELS = ["email", "phone", "in_person"] as const;

const sofiaToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Sofia" }).format(new Date());

const EMPTY = {
  name: "",
  email: "",
  phone: "",
  orderNumber: "",
  product: "",
  description: "",
  demand: "replacement" as ComplaintDemand,
  channel: "email" as (typeof CHANNELS)[number],
  receivedOn: sofiaToday(),
  locale: "bg" as "bg" | "en",
};

/** Admin → Рекламации (D-069): the register with deadlines, staff-entered complaints, outcomes. */
export function Complaints() {
  const { t, locale } = useAdmin();
  const [all, setAll] = useState(false);
  const [items, setItems] = useState<Complaint[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [outcomes, setOutcomes] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    api.complaints(all ? "all" : "open").then((r) => setItems(r.items));
  }, [all]);

  if (!items) return <p>{t("admin.loading")}</p>;
  const date = (iso: string) =>
    new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString(
      locale === "bg" ? "bg-BG" : "en-GB",
    );
  const fail = (e: unknown) =>
    setMessage({
      kind: "error",
      text: t("admin.saveFailed", {
        message: e instanceof ApiRequestError ? (e.body?.message ?? e.message) : String(e),
      }),
    });

  async function add(event: FormEvent) {
    event.preventDefault();
    const checked = StaffComplaintInput.safeParse({
      ...form,
      phone: form.phone.trim() || null,
      orderNumber: form.orderNumber.trim() || null,
    });
    if (!checked.success) {
      setMessage({
        kind: "error",
        text: t("admin.checkFields", {
          fields: [...new Set(checked.error.issues.map((i) => String(i.path[0])))].join(", "),
        }),
      });
      return;
    }
    try {
      setItems((await api.addComplaint(checked.data)).items);
      setForm(EMPTY);
      setAdding(false);
      setMessage({ kind: "ok", text: t("admin.complaints.saved") });
    } catch (e) {
      fail(e);
    }
  }

  async function close(id: string, status: "resolved" | "rejected") {
    const outcome = outcomes[id]?.trim() ?? "";
    if (outcome.length < 3) {
      setMessage({ kind: "error", text: t("admin.checkFields", { fields: t("admin.complaints.outcome") }) });
      return;
    }
    try {
      await api.resolveComplaint(id, { status, outcome });
      setItems((await api.complaints(all ? "all" : "open")).items);
      setMessage({ kind: "ok", text: t("admin.complaints.saved") });
    } catch (e) {
      fail(e);
    }
  }

  const input = (
    key: "name" | "email" | "phone" | "orderNumber" | "product",
    label: Parameters<typeof t>[0],
    type = "text",
  ) => (
    <div className="field">
      <label htmlFor={`complaint-${key}`}>{t(label)}</label>
      <input
        id={`complaint-${key}`}
        type={type}
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      />
    </div>
  );

  return (
    <section className="stack">
      <p className="note">{t("admin.complaints.lead")}</p>
      <div className="row">
        <label>
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />{" "}
          {t("admin.complaints.showAll")}
        </label>
        <a href={api.complaintsCsvUrl()}>{t("admin.complaints.csv")}</a>
        <button type="button" className="btn btn--secondary" onClick={() => setAdding(!adding)}>
          {t("admin.complaints.add")}
        </button>
      </div>
      {message ? (
        <p className={message.kind === "ok" ? "ok" : "error"} role="status">
          {message.text}
        </p>
      ) : null}

      {adding ? (
        <form className="panel stack" onSubmit={add}>
          <div className="grid-2">
            {input("name", "admin.complaints.name")}
            {input("email", "admin.complaints.email", "email")}
            {input("phone", "admin.complaints.phone", "tel")}
            {input("orderNumber", "admin.complaints.order")}
            {input("product", "admin.complaints.product")}
            <div className="field">
              <label htmlFor="complaint-receivedOn">{t("admin.complaints.receivedOn")}</label>
              <input
                id="complaint-receivedOn"
                type="date"
                max={sofiaToday()}
                value={form.receivedOn}
                onChange={(e) => setForm({ ...form, receivedOn: e.target.value })}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="complaint-description">{t("admin.complaints.description")}</label>
            <textarea
              id="complaint-description"
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="grid-3">
            <div className="field">
              <label htmlFor="complaint-demand">{t("admin.complaints.demand")}</label>
              <select
                id="complaint-demand"
                value={form.demand}
                onChange={(e) => setForm({ ...form, demand: e.target.value as ComplaintDemand })}
              >
                {DEMANDS.map((d) => (
                  <option key={d} value={d}>
                    {t(`complaint.demand.${d}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="complaint-channel">{t("admin.complaints.channel")}</label>
              <select
                id="complaint-channel"
                value={form.channel}
                onChange={(e) => setForm({ ...form, channel: e.target.value as (typeof CHANNELS)[number] })}
              >
                {CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {t(`admin.complaints.channel.${c}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="complaint-locale">{t("admin.complaints.language")}</label>
              <select
                id="complaint-locale"
                value={form.locale}
                onChange={(e) => setForm({ ...form, locale: e.target.value as "bg" | "en" })}
              >
                <option value="bg">Български</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>
          <div className="row">
            <button type="submit" className="btn">
              {t("admin.save")}
            </button>
          </div>
        </form>
      ) : null}

      {items.length === 0 ? <p>{t("admin.complaints.empty")}</p> : null}
      <ul className="checklist">
        {items.map((c) => (
          <li key={c.id} className="panel stack">
            <div>
              <strong>
                {c.number} · {c.product}
              </strong>{" "}
              · {c.name} ({c.email}
              {c.phone ? `, ${c.phone}` : ""}){c.orderNumber ? ` · ${c.orderNumber}` : ""} ·{" "}
              {t(`admin.complaints.channel.${c.channel}`)} · {date(c.receivedAt)}
            </div>
            <p>{c.description}</p>
            <p className="note">
              {t("admin.complaints.demand")}: {t(`complaint.demand.${c.demand}`)} ·{" "}
              {c.status === "open" ? null : `${t(`complaint.status.${c.status}`)} · `}
              <span className={c.overdue ? "error" : c.dueSoon ? "warning" : undefined}>
                {t(
                  c.overdue
                    ? "admin.complaints.overdue"
                    : c.dueSoon
                      ? "admin.complaints.dueSoon"
                      : "admin.complaints.due",
                  { date: date(c.dueOn) },
                )}
              </span>
            </p>
            {c.status === "open" ? (
              <>
                <div className="field">
                  <label htmlFor={`outcome-${c.id}`}>{t("admin.complaints.outcome")}</label>
                  <textarea
                    id={`outcome-${c.id}`}
                    rows={2}
                    value={outcomes[c.id] ?? ""}
                    onChange={(e) => setOutcomes({ ...outcomes, [c.id]: e.target.value })}
                  />
                </div>
                <div className="row">
                  <button type="button" className="btn" onClick={() => close(c.id, "resolved")}>
                    {t("admin.complaints.resolve")}
                  </button>
                  <button
                    type="button"
                    className="btn btn--secondary"
                    onClick={() => close(c.id, "rejected")}
                  >
                    {t("admin.complaints.reject")}
                  </button>
                </div>
              </>
            ) : c.outcome ? (
              <p className="note">{c.outcome}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
