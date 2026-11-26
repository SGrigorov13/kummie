import {
  ApiRequestError,
  type BatchDetail,
  type BatchSummary,
  type HubAddress,
  type Supplier,
  type SupplierOfferList,
} from "@kummie/contracts";
import { formatMoney, parseEuroToCents } from "@kummie/core";
import type { MessageKey } from "@kummie/i18n";
import { useEffect, useState, type FormEvent } from "react";
import { api, centsToEuroInput, useAdmin } from "./context";

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
const NEW_SUPPLIER: Supplier = {
  id: "",
  name: "",
  orderEmail: null,
  closeWeekdays: [1, 3, 5],
  closeHour: 12,
  minOrderCents: 0,
  ddp: false,
  active: true,
};

export const batchStatusKey = (s: BatchSummary["status"]) => `admin.batchStatus.${s}` as MessageKey;

function useExplain() {
  const { t } = useAdmin();
  return (e: unknown) =>
    t("admin.saveFailed", {
      message: e instanceof ApiRequestError ? (e.body?.message ?? e.message) : String(e),
    });
}

/** Admin → Сборни поръчки (M2): batches, suppliers with their offers, and the hub address. */
export function Batches() {
  const { t } = useAdmin();
  const [tab, setTab] = useState<"batches" | "suppliers" | "hub">("batches");
  return (
    <div className="stack">
      <div className="row" role="tablist">
        {(["batches", "suppliers", "hub"] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? "btn" : "btn btn--secondary"}
            onClick={() => setTab(id)}
          >
            {t(`admin.ops.tab.${id}`)}
          </button>
        ))}
      </div>
      {tab === "batches" ? <BatchesTab /> : null}
      {tab === "suppliers" ? <SuppliersTab /> : null}
      {tab === "hub" ? <HubAddressTab /> : null}
    </div>
  );
}

function BatchesTab() {
  const { t, locale } = useAdmin();
  const explain = useExplain();
  const [items, setItems] = useState<BatchSummary[] | null>(null);
  const [open, setOpen] = useState<BatchDetail | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [tracking, setTracking] = useState("");
  const [busy, setBusy] = useState(false);
  const date = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString(locale === "bg" ? "bg-BG" : "en-GB") : "—";

  const reload = () => api.batches().then((r) => setItems(r.items));
  useEffect(() => {
    api.batches().then((r) => setItems(r.items));
  }, []);

  async function act(work: () => Promise<BatchDetail | null>, ok: string) {
    setBusy(true);
    setMessage(null);
    try {
      const next = await work();
      if (next) setOpen(next);
      setMessage({ kind: "ok", text: ok });
      await reload();
    } catch (e) {
      setMessage({ kind: "error", text: explain(e) });
    } finally {
      setBusy(false);
    }
  }

  async function run() {
    setBusy(true);
    setMessage(null);
    try {
      const r = await api.runOperations();
      const text = t("admin.ops.runResult", { assigned: r.assigned, closed: r.closed, tracked: r.tracked });
      setMessage(
        r.waitingWithoutOffer.length
          ? {
              kind: "error",
              text: `${text} ${t("admin.ops.waiting", { orders: r.waitingWithoutOffer.join(", ") })}`,
            }
          : { kind: "ok", text },
      );
      await reload();
    } catch (e) {
      setMessage({ kind: "error", text: explain(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="row">
        <button type="button" className="btn btn--secondary" disabled={busy} onClick={() => void run()}>
          {t("admin.ops.run")}
        </button>
        <span className="note">{t("admin.ops.runNote")}</span>
      </div>
      {message ? (
        <p className={message.kind === "ok" ? "ok" : "error"} role="status">
          {message.text}
        </p>
      ) : null}
      {items && items.length === 0 ? <p>{t("admin.ops.noBatches")}</p> : null}
      {items && items.length > 0 ? (
        <table className="table">
          <thead>
            <tr>
              <th>{t("admin.ops.po")}</th>
              <th>{t("admin.ops.supplier")}</th>
              <th>{t("admin.ops.status")}</th>
              <th>{t("admin.ops.closes")}</th>
              <th>{t("admin.ops.orders")}</th>
              <th>{t("admin.ops.units")}</th>
              <th>{t("admin.ops.cost")}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((b) => (
              <tr key={b.id}>
                <td>
                  <button type="button" className="link-button" onClick={() => api.batch(b.id).then(setOpen)}>
                    {b.poReference ?? t("admin.ops.openBatch")}
                  </button>
                </td>
                <td>{b.supplierName}</td>
                <td>{t(batchStatusKey(b.status))}</td>
                <td>{b.status === "open" ? date(b.closesAt) : "—"}</td>
                <td>{b.orders}</td>
                <td>
                  {b.status === "received" || b.receivedUnits > 0 ? `${b.receivedUnits}/${b.units}` : b.units}
                </td>
                <td>{formatMoney(b.costCents, locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {open ? (
        <section className="panel stack">
          <h2>
            {open.poReference ?? t("admin.ops.openBatch")} · {open.supplierName} ·{" "}
            {t(batchStatusKey(open.status))}
          </h2>
          <p className="note">
            {t("admin.ops.ordersIn")}: {open.orderNumbers.join(", ")}
          </p>
          <table className="table">
            <thead>
              <tr>
                <th>{t("admin.ops.supplierSku")}</th>
                <th>{t("admin.editor.sku")}</th>
                <th>{t("admin.ops.product")}</th>
                <th>{t("admin.ops.units")}</th>
                <th>{t("admin.ops.received")}</th>
                <th>{t("admin.ops.unitCost")}</th>
              </tr>
            </thead>
            <tbody>
              {open.items.map((i) => (
                <tr
                  key={i.supplierSku}
                  className={i.receivedQty < i.qty && open.status === "received" ? "row--missing" : ""}
                >
                  <td>{i.supplierSku}</td>
                  <td>{i.sku}</td>
                  <td>{i.description}</td>
                  <td>{i.qty}</td>
                  <td>{i.receivedQty}</td>
                  <td>{formatMoney(i.unitCostCents, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {open.status === "open" ? (
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => {
                if (window.confirm(t("admin.ops.confirmClose")))
                  void act(() => api.closeBatch(open.id), t("admin.ops.closedNow"));
              }}
            >
              {t("admin.ops.closeNow")}
            </button>
          ) : null}
          {open.status === "ordered" ? (
            <form
              className="row"
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                void act(() => api.batchShipped(open.id, tracking.trim() || null), t("admin.saved"));
              }}
            >
              <input
                aria-label={t("admin.ops.supplierTracking")}
                placeholder={t("admin.ops.supplierTracking")}
                value={tracking}
                onChange={(e) => setTracking(e.target.value)}
              />
              <button type="submit" className="btn" disabled={busy}>
                {t("admin.ops.markShipped")}
              </button>
            </form>
          ) : null}
          {open.supplierTracking ? (
            <p>
              {t("admin.ops.supplierTracking")}: {open.supplierTracking}
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function SuppliersTab() {
  const { t, locale } = useAdmin();
  const explain = useExplain();
  const [list, setList] = useState<Supplier[]>([]);
  const [form, setForm] = useState<Supplier>(NEW_SUPPLIER);
  const [isNew, setIsNew] = useState(true);
  const [minEuro, setMinEuro] = useState("0");
  const [offers, setOffers] = useState<SupplierOfferList | null>(null);
  const [offer, setOffer] = useState({ sku: "", supplierSku: "", cost: "", active: true });
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    api.suppliers().then((r) => setList(r.items));
  }, []);

  function edit(s: Supplier) {
    setForm(s);
    setIsNew(false);
    setMinEuro(centsToEuroInput(s.minOrderCents));
    api.supplierOffers(s.id).then(setOffers);
    setMessage(null);
  }

  async function saveSupplier(e: FormEvent) {
    e.preventDefault();
    try {
      const saved = await api.saveSupplier({ ...form, minOrderCents: parseEuroToCents(minEuro) ?? 0 });
      setList((await api.suppliers()).items);
      edit(saved);
      setMessage({ kind: "ok", text: t("admin.saved") });
    } catch (err) {
      setMessage({ kind: "error", text: explain(err) });
    }
  }

  async function saveOffer(e: FormEvent) {
    e.preventDefault();
    const cost = parseEuroToCents(offer.cost);
    if (!cost) return setMessage({ kind: "error", text: t("admin.ops.costInvalid") });
    try {
      setOffers(
        await api.saveOffer(form.id, {
          sku: offer.sku,
          supplierSku: offer.supplierSku,
          unitCostCents: cost,
          active: offer.active,
        }),
      );
      setOffer({ sku: "", supplierSku: "", cost: "", active: true });
      setMessage({ kind: "ok", text: t("admin.saved") });
    } catch (err) {
      setMessage({ kind: "error", text: explain(err) });
    }
  }

  return (
    <div className="stack">
      <div className="row">
        {list.map((s) => (
          <button key={s.id} type="button" className="btn btn--secondary" onClick={() => edit(s)}>
            {s.name}
            {s.active ? "" : ` (${t("admin.ops.inactive")})`}
          </button>
        ))}
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => {
            setForm(NEW_SUPPLIER);
            setIsNew(true);
            setMinEuro("0");
            setOffers(null);
          }}
        >
          + {t("admin.ops.newSupplier")}
        </button>
      </div>
      {message ? (
        <p className={message.kind === "ok" ? "ok" : "error"} role="status">
          {message.text}
        </p>
      ) : null}

      <form className="panel stack" onSubmit={saveSupplier}>
        <h2>{isNew ? t("admin.ops.newSupplier") : form.name}</h2>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="s-id">{t("admin.ops.supplierId")}</label>
            <input
              id="s-id"
              value={form.id}
              disabled={!isNew}
              onChange={(e) => setForm({ ...form, id: e.target.value.toLowerCase() })}
            />
          </div>
          <div className="field">
            <label htmlFor="s-name">{t("admin.ops.supplierName")}</label>
            <input
              id="s-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="s-mail">{t("admin.ops.orderEmail")}</label>
            <input
              id="s-mail"
              type="email"
              value={form.orderEmail ?? ""}
              onChange={(e) => setForm({ ...form, orderEmail: e.target.value || null })}
            />
          </div>
          <div className="field">
            <label htmlFor="s-min">{t("admin.ops.minOrder")}</label>
            <input
              id="s-min"
              inputMode="decimal"
              value={minEuro}
              onChange={(e) => setMinEuro(e.target.value)}
            />
          </div>
        </div>
        <fieldset className="fieldset">
          <legend>{t("admin.ops.closeDays")}</legend>
          <div className="row">
            {WEEKDAYS.map((d) => (
              <label key={d} className="check">
                <input
                  type="checkbox"
                  checked={form.closeWeekdays.includes(d)}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      closeWeekdays: e.target.checked
                        ? [...form.closeWeekdays, d].toSorted()
                        : form.closeWeekdays.filter((x) => x !== d),
                    })
                  }
                />
                {t(`admin.ops.weekday.${d}`)}
              </label>
            ))}
            <label className="check">
              {t("admin.ops.closeHour")}
              <input
                type="number"
                min={0}
                max={23}
                value={form.closeHour}
                onChange={(e) => setForm({ ...form, closeHour: Number(e.target.value) })}
                style={{ width: 70 }}
              />
            </label>
          </div>
        </fieldset>
        <div className="row">
          <label className="check">
            <input
              type="checkbox"
              checked={form.ddp}
              onChange={(e) => setForm({ ...form, ddp: e.target.checked })}
            />
            {t("admin.ops.ddp")}
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />
            {t("admin.ops.active")}
          </label>
        </div>
        <button type="submit" className="btn">
          {t("admin.save")}
        </button>
      </form>

      {offers && !isNew ? (
        <section className="panel stack">
          <h2>{t("admin.ops.offers")}</h2>
          <p className="note">{t("admin.ops.offersLead")}</p>
          <form className="row" onSubmit={saveOffer}>
            <input
              aria-label={t("admin.editor.sku")}
              placeholder={t("admin.editor.sku")}
              value={offer.sku}
              onChange={(e) => setOffer({ ...offer, sku: e.target.value.toUpperCase() })}
            />
            <input
              aria-label={t("admin.ops.supplierSku")}
              placeholder={t("admin.ops.supplierSku")}
              value={offer.supplierSku}
              onChange={(e) => setOffer({ ...offer, supplierSku: e.target.value.toUpperCase() })}
            />
            <input
              aria-label={t("admin.ops.unitCost")}
              placeholder={t("admin.ops.unitCost")}
              inputMode="decimal"
              value={offer.cost}
              onChange={(e) => setOffer({ ...offer, cost: e.target.value })}
            />
            <label className="check">
              <input
                type="checkbox"
                checked={offer.active}
                onChange={(e) => setOffer({ ...offer, active: e.target.checked })}
              />
              {t("admin.ops.active")}
            </label>
            <button type="submit" className="btn">
              {t("admin.ops.saveOffer")}
            </button>
          </form>
          <table className="table">
            <thead>
              <tr>
                <th>{t("admin.editor.sku")}</th>
                <th>{t("admin.ops.product")}</th>
                <th>{t("admin.ops.supplierSku")}</th>
                <th>{t("admin.ops.unitCost")}</th>
                <th>{t("admin.ops.price")}</th>
                <th>{t("admin.ops.active")}</th>
              </tr>
            </thead>
            <tbody>
              {offers.items.map((o) => (
                <tr
                  key={o.id}
                  onClick={() =>
                    setOffer({
                      sku: o.sku,
                      supplierSku: o.supplierSku,
                      cost: centsToEuroInput(o.unitCostCents),
                      active: o.active,
                    })
                  }
                >
                  <td>{o.sku}</td>
                  <td>
                    {o.title} — {o.version}
                  </td>
                  <td>{o.supplierSku}</td>
                  <td>{formatMoney(o.unitCostCents, locale)}</td>
                  <td>{formatMoney(o.priceCents, locale)}</td>
                  <td>{o.active ? "✓" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {offers.withoutOffer.length > 0 ? (
            <div className="stack">
              <h3>{t("admin.ops.withoutOffer")}</h3>
              <ul className="checklist">
                {offers.withoutOffer.map((w) => (
                  <li key={w.sku}>
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => setOffer({ ...offer, sku: w.sku })}
                    >
                      {w.sku}
                    </button>{" "}
                    {w.title} — {w.version}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function HubAddressTab() {
  const { t } = useAdmin();
  const explain = useExplain();
  const [hub, setHub] = useState<HubAddress>({ name: "", line1: "", city: "", postcode: "" });
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  useEffect(() => {
    api.operationsSettings().then((r) => r.hub && setHub(r.hub));
  }, []);
  return (
    <form
      className="panel stack"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await api.saveHubAddress(hub);
          setMessage({ kind: "ok", text: t("admin.saved") });
        } catch (err) {
          setMessage({ kind: "error", text: explain(err) });
        }
      }}
    >
      <h2>{t("admin.ops.hubAddress")}</h2>
      <p className="note">{t("admin.ops.hubLead")}</p>
      {(["name", "line1", "city", "postcode"] as const).map((f) => (
        <div className="field" key={f}>
          <label htmlFor={`hub-${f}`}>{t(`admin.ops.hub.${f}`)}</label>
          <input id={`hub-${f}`} value={hub[f]} onChange={(e) => setHub({ ...hub, [f]: e.target.value })} />
        </div>
      ))}
      <button type="submit" className="btn">
        {t("admin.save")}
      </button>
      {message ? (
        <p className={message.kind === "ok" ? "ok" : "error"} role="status">
          {message.text}
        </p>
      ) : null}
    </form>
  );
}
