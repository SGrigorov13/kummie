import {
  ApiRequestError,
  type BatchDetail,
  type BatchSummary,
  type PackingSlip,
  type PackOrder,
} from "@kummie/contracts";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { batchStatusKey } from "./Batches";
import { api, useAdmin } from "./context";
import { PackingSlipPrint } from "./PackingSlipPrint";

type Message = { kind: "ok" | "error"; text: string } | null;

/** A barcode scanner types the code and Enter; the field keeps the focus between scans (B9). */
function ScanField({
  label,
  onScan,
  disabled,
}: {
  label: string;
  onScan: (code: string) => void;
  disabled?: boolean;
}) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!disabled) ref.current?.focus();
  }, [disabled]);
  return (
    <form
      className="row"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        const code = value.trim();
        setValue("");
        if (code) onScan(code);
        ref.current?.focus();
      }}
    >
      <input
        ref={ref}
        className="scan"
        aria-label={label}
        placeholder={label}
        value={value}
        disabled={disabled}
        autoComplete="off"
        onChange={(e) => setValue(e.target.value)}
      />
      <button type="submit" className="btn btn--secondary" disabled={disabled}>
        OK
      </button>
    </form>
  );
}

function beep(ok: boolean) {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    osc.frequency.value = ok ? 880 : 220;
    osc.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (ok ? 0.08 : 0.3));
  } catch {
    // No sound available: the message on screen is enough.
  }
}

/** Admin → Пункт България (M2): receiving batches, packing orders, hand-over to the courier. */
export function Hub() {
  const { t } = useAdmin();
  const [tab, setTab] = useState<"receive" | "pack" | "handover">("receive");
  return (
    <div className="stack">
      <div className="row" role="tablist">
        {(["receive", "pack", "handover"] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? "btn" : "btn btn--secondary"}
            onClick={() => setTab(id)}
          >
            {t(`admin.hub.tab.${id}`)}
          </button>
        ))}
      </div>
      {tab === "receive" ? <Receive /> : null}
      {tab === "pack" ? <Pack /> : null}
      {tab === "handover" ? <HandOver /> : null}
    </div>
  );
}

function errorText(e: unknown) {
  return e instanceof ApiRequestError ? (e.body?.message ?? e.message) : String(e);
}

function Receive() {
  const { t } = useAdmin();
  const [list, setList] = useState<BatchSummary[]>([]);
  const [batch, setBatch] = useState<BatchDetail | null>(null);
  const [message, setMessage] = useState<Message>(null);

  const load = () =>
    api
      .batches()
      .then((r) => setList(r.items.filter((b) => b.status === "ordered" || b.status === "shipped")));
  useEffect(() => {
    api
      .batches()
      .then((r) => setList(r.items.filter((b) => b.status === "ordered" || b.status === "shipped")));
  }, []);

  async function scan(code: string) {
    if (!batch) return;
    try {
      const r = await api.scanReceived(batch.id, code);
      setBatch(r.batch);
      beep(r.ok);
      setMessage(
        r.ok
          ? { kind: "ok", text: t("admin.hub.scanned", { code }) }
          : {
              kind: "error",
              text: t(r.problem === "complete" ? "admin.hub.alreadyAll" : "admin.hub.notInBatch", { code }),
            },
      );
    } catch (e) {
      beep(false);
      setMessage({ kind: "error", text: errorText(e) });
    }
  }

  if (!batch)
    return (
      <div className="stack">
        <p className="note">{t("admin.hub.receiveLead")}</p>
        {list.length === 0 ? <p>{t("admin.hub.nothingToReceive")}</p> : null}
        <ul className="checklist">
          {list.map((b) => (
            <li key={b.id}>
              <button type="button" className="link-button" onClick={() => api.batch(b.id).then(setBatch)}>
                {b.poReference} · {b.supplierName}
              </button>{" "}
              · {t(batchStatusKey(b.status))} · {b.units} {t("admin.hub.units")}
            </li>
          ))}
        </ul>
      </div>
    );

  const missing = batch.items.reduce((n, i) => n + Math.max(0, i.qty - i.receivedQty), 0);
  return (
    <section className="panel stack">
      <button type="button" className="link-button" onClick={() => (setBatch(null), void load())}>
        ← {t("admin.hub.tab.receive")}
      </button>
      <h2>
        {batch.poReference} · {batch.supplierName}
      </h2>
      <ScanField label={t("admin.hub.scanProduct")} onScan={(c) => void scan(c)} />
      {message ? (
        <p className={message.kind === "ok" ? "ok" : "error"} role="status">
          {message.text}
        </p>
      ) : null}
      <table className="table">
        <thead>
          <tr>
            <th>{t("admin.ops.supplierSku")}</th>
            <th>{t("admin.editor.sku")}</th>
            <th>{t("admin.ops.product")}</th>
            <th>{t("admin.hub.expected")}</th>
            <th>{t("admin.ops.received")}</th>
          </tr>
        </thead>
        <tbody>
          {batch.items.map((i) => (
            <tr key={i.supplierSku} className={i.receivedQty >= i.qty ? "row--done" : ""}>
              <td>{i.supplierSku}</td>
              <td>{i.sku}</td>
              <td>{i.description}</td>
              <td>{i.qty}</td>
              <td>
                <input
                  type="number"
                  min={0}
                  max={i.qty}
                  value={i.receivedQty}
                  aria-label={`${t("admin.ops.received")} ${i.supplierSku}`}
                  style={{ width: 70 }}
                  onChange={(e) =>
                    api
                      .setReceived(batch.id, i.supplierSku, Math.max(0, Number(e.target.value) || 0))
                      .then(setBatch, (err: unknown) => setMessage({ kind: "error", text: errorText(err) }))
                  }
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className={missing > 0 ? "error" : "ok"}>
        {missing > 0 ? t("admin.hub.missing", { count: missing }) : t("admin.hub.allReceived")}
      </p>
      <button
        type="button"
        className="btn"
        onClick={async () => {
          if (missing > 0 && !window.confirm(t("admin.hub.confirmShort", { count: missing }))) return;
          try {
            setBatch(await api.finishReceiving(batch.id));
            setMessage({ kind: "ok", text: t("admin.hub.receivedDone") });
          } catch (e) {
            setMessage({ kind: "error", text: errorText(e) });
          }
        }}
        disabled={batch.status === "received"}
      >
        {t("admin.hub.finishReceiving")}
      </button>
    </section>
  );
}

function Pack() {
  const { t } = useAdmin();
  const [queue, setQueue] = useState<PackOrder[]>([]);
  const [current, setCurrent] = useState<PackOrder | null>(null);
  const [scanned, setScanned] = useState<Record<string, number>>({});
  const [weight, setWeight] = useState("0.5");
  const [message, setMessage] = useState<Message>(null);
  const [busy, setBusy] = useState(false);
  const [slip, setSlip] = useState<PackingSlip | null>(null);

  useEffect(() => {
    api.packQueue().then((r) => setQueue(r.items));
  }, []);

  // Print once the packing list is on the page (D-065: an ordinary A4 printer).
  useEffect(() => {
    if (!slip) return;
    const done = () => setSlip(null);
    window.addEventListener("afterprint", done, { once: true });
    const timer = window.setTimeout(() => window.print(), 50);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("afterprint", done);
    };
  }, [slip]);

  async function printSlip(orderId: string) {
    setMessage({ kind: "ok", text: t("admin.hub.slipLoading") });
    try {
      const next = await api.packingSlip(orderId);
      setMessage(next.returnAddress ? null : { kind: "error", text: t("admin.hub.noReturnAddress") });
      setSlip(next);
    } catch (e) {
      setMessage({ kind: "error", text: errorText(e) });
    }
  }

  const slipButton = (orderId: string) => (
    <button type="button" className="link-button" onClick={() => void printSlip(orderId)}>
      {t("admin.hub.printSlip")}
    </button>
  );

  function start(order: PackOrder) {
    setCurrent(order);
    setScanned({});
    setWeight((order.lines.reduce((n, l) => n + l.qty, 0) * 0.5).toFixed(1));
    setMessage(null);
  }

  function scan(code: string) {
    if (!current) return;
    const upper = code.toUpperCase();
    const line = current.lines.find(
      (l) => l.sku.toUpperCase() === upper || l.supplierSku?.toUpperCase() === upper,
    );
    if (!line) {
      beep(false);
      return setMessage({ kind: "error", text: t("admin.hub.wrongProduct", { code }) });
    }
    const count = scanned[line.sku] ?? 0;
    if (count >= line.qty) {
      beep(false);
      return setMessage({ kind: "error", text: t("admin.hub.tooMany", { title: line.title }) });
    }
    beep(true);
    setScanned({ ...scanned, [line.sku]: count + 1 });
    setMessage({ kind: "ok", text: `${line.title} — ${line.version}` });
  }

  function removeOne(sku: string) {
    setScanned({ ...scanned, [sku]: Math.max(0, (scanned[sku] ?? 0) - 1) });
  }

  const complete = !!current && current.lines.every((l) => (scanned[l.sku] ?? 0) === l.qty);

  async function pack() {
    if (!current) return;
    const kg = Number(weight.replace(",", "."));
    if (!(kg > 0)) return setMessage({ kind: "error", text: t("admin.hub.weightInvalid") });
    setBusy(true);
    try {
      const next = await api.packOrder(current.id, {
        items: Object.entries(scanned).map(([sku, qty]) => ({ sku, qty })),
        weightGrams: Math.round(kg * 1000),
      });
      setQueue(next.items);
      const packed = next.items.find((o) => o.id === current.id);
      if (packed?.parcel) window.open(api.labelUrl(packed.parcel.id), "_blank", "noopener");
      setCurrent(null);
      setMessage({
        kind: "ok",
        text: t("admin.hub.packedDone", { tracking: packed?.parcel?.trackingNumber ?? "" }),
      });
    } catch (e) {
      setMessage({ kind: "error", text: errorText(e) });
    } finally {
      setBusy(false);
    }
  }

  const printable = slip ? <PackingSlipPrint slip={slip} /> : null;

  if (current)
    return (
      <section className="panel stack">
        {printable}
        <button type="button" className="link-button" onClick={() => setCurrent(null)}>
          ← {t("admin.hub.tab.pack")}
        </button>
        <h2>
          {current.number} · {current.name} · {current.city}, {current.country}
        </h2>
        <p>{slipButton(current.id)}</p>
        <ScanField label={t("admin.hub.scanProduct")} onScan={scan} disabled={busy} />
        {message ? (
          <p className={message.kind === "ok" ? "ok" : "error"} role="status">
            {message.text}
          </p>
        ) : null}
        <table className="table">
          <thead>
            <tr>
              <th>{t("admin.editor.sku")}</th>
              <th>{t("admin.ops.product")}</th>
              <th>{t("admin.hub.inBox")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {current.lines.map((l) => (
              <tr key={l.sku} className={(scanned[l.sku] ?? 0) === l.qty ? "row--done" : ""}>
                <td>{l.sku}</td>
                <td>
                  {l.title} — {l.version}
                </td>
                <td>
                  {scanned[l.sku] ?? 0} / {l.qty}
                </td>
                <td>
                  <div className="row">
                    <button
                      type="button"
                      className="btn btn--secondary"
                      aria-label={t("admin.hub.confirmOneLabel", { title: l.title })}
                      disabled={busy || (scanned[l.sku] ?? 0) >= l.qty}
                      onClick={() => scan(l.sku)}
                    >
                      {t("admin.hub.confirmOne")}
                    </button>
                    <button
                      type="button"
                      className="btn btn--secondary"
                      aria-label={t("admin.hub.removeOneLabel", { title: l.title })}
                      disabled={busy || (scanned[l.sku] ?? 0) === 0}
                      onClick={() => removeOne(l.sku)}
                    >
                      {t("admin.hub.removeOne")}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row">
          <label className="check" htmlFor="pack-weight">
            {t("admin.hub.weight")}
          </label>
          <input
            id="pack-weight"
            inputMode="decimal"
            value={weight}
            style={{ width: 90 }}
            onChange={(e) => setWeight(e.target.value)}
          />
          <button type="button" className="btn" disabled={!complete || busy} onClick={() => void pack()}>
            {t("admin.hub.makeLabel")}
          </button>
        </div>
        {!complete ? <p className="note">{t("admin.hub.scanAll")}</p> : null}
      </section>
    );

  const waiting = queue.filter((o) => o.status === "received_at_hub");
  const packed = queue.filter((o) => o.status === "packed" && o.parcel);
  return (
    <div className="stack">
      {printable}
      {message ? (
        <p className={message.kind === "ok" ? "ok" : "error"} role="status">
          {message.text}
        </p>
      ) : null}
      <section className="panel stack">
        <h2>{t("admin.hub.toPack")}</h2>
        {waiting.length === 0 ? <p>{t("admin.hub.nothingToPack")}</p> : null}
        <ul className="checklist">
          {waiting.map((o) => (
            <li key={o.id}>
              <button type="button" className="link-button" onClick={() => start(o)}>
                {o.number}
              </button>{" "}
              · {o.name} · {o.city}, {o.country} · {o.lines.reduce((n, l) => n + l.qty, 0)}{" "}
              {t("admin.hub.units")} · {slipButton(o.id)}
            </li>
          ))}
        </ul>
      </section>
      <section className="panel stack">
        <h2>{t("admin.hub.waitingCourier")}</h2>
        {packed.length === 0 ? <p>—</p> : null}
        <ul className="checklist">
          {packed.map((o) => (
            <li key={o.id}>
              {o.number} · {o.parcel?.trackingNumber} ·{" "}
              <a href={api.labelUrl(o.parcel?.id ?? "")} target="_blank" rel="noreferrer">
                {t("admin.hub.printLabel")}
              </a>{" "}
              · {slipButton(o.id)} ·{" "}
              <button
                type="button"
                className="link-button"
                onClick={async () => {
                  const tracking = o.parcel?.trackingNumber ?? "";
                  if (!tracking || !window.confirm(t("admin.hub.confirmHanded", { tracking }))) return;
                  try {
                    const r = await api.handOver(tracking);
                    setMessage({
                      kind: "ok",
                      text: t("admin.hub.handedOver", { order: r.orderNumber, tracking: r.trackingNumber }),
                    });
                    setQueue((await api.packQueue()).items);
                  } catch (e) {
                    setMessage({ kind: "error", text: errorText(e) });
                  }
                }}
              >
                {t("admin.hub.markHanded")}
              </button>{" "}
              ·{" "}
              <button
                type="button"
                className="link-button"
                onClick={async () => {
                  if (!o.parcel || !window.confirm(t("admin.hub.confirmCancelLabel"))) return;
                  try {
                    setQueue((await api.cancelParcel(o.parcel.id)).items);
                  } catch (e) {
                    setMessage({ kind: "error", text: errorText(e) });
                  }
                }}
              >
                {t("admin.hub.cancelLabel")}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function HandOver() {
  const { t } = useAdmin();
  const [log, setLog] = useState<{ ok: boolean; text: string }[]>([]);
  return (
    <section className="panel stack">
      <p className="note">{t("admin.hub.handoverLead")}</p>
      <ScanField
        label={t("admin.hub.scanLabel")}
        onScan={async (code) => {
          try {
            const r = await api.handOver(code);
            beep(true);
            setLog([
              {
                ok: true,
                text: t("admin.hub.handedOver", { order: r.orderNumber, tracking: r.trackingNumber }),
              },
              ...log,
            ]);
          } catch (e) {
            beep(false);
            const reason =
              e instanceof ApiRequestError && e.body?.error === "not_found"
                ? t("admin.hub.unknownLabel")
                : e instanceof ApiRequestError && e.body?.error === "not_allowed"
                  ? t("admin.hub.alreadyHanded")
                  : errorText(e);
            setLog([{ ok: false, text: `${code}: ${reason}` }, ...log]);
          }
        }}
      />
      <ul className="checklist">
        {log.map((l, i) => (
          <li key={i} className={l.ok ? "ok" : "error"}>
            {l.text}
          </li>
        ))}
      </ul>
    </section>
  );
}
