import type { SalesReadiness as Readiness } from "@kummie/contracts";
import type { MessageKey } from "@kummie/i18n";
import { useEffect, useState, type FormEvent } from "react";
import { api, useAdmin } from "./context";

const LEGAL_PAGES = ["terms", "withdrawal", "returns", "guarantee", "privacy", "complaints"] as const;
const NAP_KINDS = ["payment_provider", "vpos_terminal", "domain", "hosting", "closing", "other"] as const;

/** One missing item in plain words ("ЕИК", "OSS от 01.01.2027", "Поверителност"…). */
function useMissingLabel() {
  const { t } = useAdmin();
  return (item: string) => {
    if (item.startsWith("ossEffectiveFrom:"))
      return t("admin.gate.ossNotYet", { date: item.split(":")[1] ?? "" });
    const key = `admin.gate.item.${item}` as MessageKey;
    const text: string | undefined = t(key);
    return text && text !== key ? text : item;
  };
}

/**
 * Admin → Готовност за продажби: every go-live condition green or red, the sales switch (only when all
 * are green), lawyer approval of the legal pages and the Приложение № 33 7-day reminders.
 */
export function SalesReadiness() {
  const { t, locale } = useAdmin();
  const label = useMissingLabel();
  const [state, setState] = useState<Readiness | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<(typeof NAP_KINDS)[number]>("payment_provider");
  // Local date (en-CA gives YYYY-MM-DD), not UTC: near midnight UTC is still the previous day.
  const [changedOn, setChangedOn] = useState(() => new Date().toLocaleDateString("en-CA"));
  const [note, setNote] = useState("");

  useEffect(() => {
    api.salesReadiness().then(setState, () => setState(null));
  }, []);

  const run = (call: Promise<Readiness>) =>
    call.then(
      (next) => {
        setState(next);
        setError(null);
      },
      (e: unknown) =>
        setError(t("admin.saveFailed", { message: e instanceof Error ? e.message : String(e) })),
    );

  if (!state) return <p>{t("admin.loading")}</p>;
  const date = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(locale === "bg" ? "bg-BG" : "en-GB");

  function addUpdate(event: FormEvent) {
    event.preventDefault();
    void run(api.addNapUpdate({ kind, changedOn, note: note.trim() || null }));
    setNote("");
  }

  return (
    <div className="stack">
      <section className="panel stack">
        <p className="note">{t("admin.gate.lead")}</p>
        <p>
          <strong>{t(`admin.gate.mode.${state.mode}` as MessageKey)}</strong>
        </p>
        <ul className="checklist">
          {state.conditions.map((c) => (
            <li key={c.id} className={c.ok ? "ok" : "missing"}>
              <span aria-hidden="true">{c.ok ? "✓" : "✗"}</span> {t(`admin.gate.cond.${c.id}` as MessageKey)}
              {c.ok ? null : <span className="note"> — {c.missing.map(label).join(", ")}</span>}
            </li>
          ))}
        </ul>
        {state.enabled ? (
          <button type="button" className="btn btn--secondary" onClick={() => run(api.setSales(false))}>
            {t("admin.gate.turnOff")}
          </button>
        ) : (
          <button
            type="button"
            className="btn"
            disabled={!state.canEnable}
            onClick={() => {
              if (window.confirm(t("admin.gate.confirmOn"))) void run(api.setSales(true));
            }}
          >
            {t("admin.gate.turnOn")}
          </button>
        )}
        {!state.canEnable && !state.enabled ? <p className="note">{t("admin.gate.cannot")}</p> : null}
        {error ? (
          <p className="note" role="alert">
            {error}
          </p>
        ) : null}
      </section>

      <section className="panel stack">
        <h2>{t("admin.gate.legalTitle")}</h2>
        <p className="note">{t("admin.gate.legalLead")}</p>
        {LEGAL_PAGES.map((page) => {
          const approved = state.legalApproved[page];
          return (
            <label key={page} className="check">
              <input
                type="checkbox"
                checked={Boolean(approved)}
                onChange={(e) => run(api.approveLegalPage(page, e.target.checked))}
              />
              {t(`admin.gate.item.${page}` as MessageKey)}
              {approved ? (
                <span className="note"> — {t("admin.gate.approvedOn", { date: date(approved) })}</span>
              ) : null}
            </label>
          );
        })}
      </section>

      <section className="panel stack">
        <h2>{t("admin.gate.napTitle")}</h2>
        <p className="note">{t("admin.gate.napLead")}</p>
        {state.napUpdates.length === 0 ? <p>{t("admin.gate.napNone")}</p> : null}
        <ul>
          {state.napUpdates.map((u) => (
            <li key={u.id}>
              <strong>{t(`admin.gate.nap.${u.kind}` as MessageKey)}</strong> · {date(u.changedOn)}
              {u.note ? ` · ${u.note}` : ""} ·{" "}
              {u.submittedOn ? (
                t("admin.gate.napSubmitted", { date: date(u.submittedOn) })
              ) : (
                <>
                  <span role={u.daysLeft < 2 ? "alert" : undefined}>
                    {u.daysLeft >= 0
                      ? t("admin.gate.napDue", { date: date(u.dueOn), days: u.daysLeft })
                      : t("admin.gate.napLate", { date: date(u.dueOn) })}
                  </span>{" "}
                  <button
                    type="button"
                    className="btn btn--secondary"
                    onClick={() => run(api.markNapUpdateSubmitted(u.id))}
                  >
                    {t("admin.gate.napMark")}
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
        <form className="row" onSubmit={addUpdate}>
          <select
            aria-label={t("admin.gate.napKind")}
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
          >
            {NAP_KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`admin.gate.nap.${k}` as MessageKey)}
              </option>
            ))}
          </select>
          <input
            type="date"
            aria-label={t("admin.gate.napDate")}
            value={changedOn}
            onChange={(e) => setChangedOn(e.target.value)}
          />
          <input
            aria-label={t("admin.order.note")}
            placeholder={t("admin.order.note")}
            maxLength={300}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <button type="submit" className="btn btn--secondary">
            {t("admin.gate.napAdd")}
          </button>
        </form>
      </section>
    </div>
  );
}

/** Dashboard banner: open Приложение № 33 updates with their deadline. */
export function NapReminderBanner() {
  const { t, staff } = useAdmin();
  const [due, setDue] = useState<Readiness["napUpdates"]>([]);
  useEffect(() => {
    if (staff.role !== "admin") return;
    api.salesReadiness().then(
      (s) => setDue(s.napUpdates.filter((u) => !u.submittedOn)),
      () => undefined,
    );
  }, [staff.role]);
  if (due.length === 0) return null;
  return (
    <p className="note" role="alert">
      {t("admin.gate.banner", { count: due.length, days: Math.min(...due.map((u) => u.daysLeft)) })}
    </p>
  );
}
