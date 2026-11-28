import { NumberingRangeInput, type NumberingSeries } from "@kummie/contracts";
import { formatDocNumber } from "@kummie/core";
import { useEffect, useState } from "react";
import { api, useAdmin } from "./context";

/** Warn when less than this share of the range is left. */
const LOW_SHARE = 0.05;

/**
 * Settings → Company → Document numbering (D-067): the accountant's range for each series, set
 * before the first document and locked after it.
 */
export function NumberingSettings() {
  const { t } = useAdmin();
  const [items, setItems] = useState<NumberingSeries[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { first: string; end: string }>>({});
  const [message, setMessage] = useState("");

  useEffect(() => {
    api.getNumbering().then((list) => {
      setItems(list.items);
      setDrafts(
        Object.fromEntries(
          list.items.map((s) => [
            s.series,
            {
              first: s.firstNumber ? String(s.firstNumber) : "",
              end: s.endNumber ? String(s.endNumber) : "",
            },
          ]),
        ),
      );
    });
  }, []);

  if (!items) return <p>{t("admin.loading")}</p>;

  async function save(series: NumberingSeries["series"]) {
    const draft = drafts[series];
    const checked = NumberingRangeInput.safeParse({
      firstNumber: Number(draft?.first),
      endNumber: Number(draft?.end),
    });
    if (!checked.success) {
      setMessage(t("admin.numberingSaveFailed"));
      return;
    }
    try {
      setItems((await api.saveNumbering(series, checked.data)).items);
      setMessage(t("admin.saved"));
    } catch {
      setMessage(t("admin.numberingSaveFailed"));
    }
  }

  return (
    <section className="panel stack">
      <h2>{t("admin.numberingTitle")}</h2>
      <p className="note">{t("admin.numberingLead")}</p>
      {items.map((s) => {
        const draft = drafts[s.series] ?? { first: "", end: "" };
        const size = (s.endNumber ?? 9_999_999_999) - (s.firstNumber ?? 1) + 1;
        return (
          <div key={s.series} className="stack">
            <h3>{t(`admin.numberingSeries.${s.series}`)}</h3>
            {s.locked ? (
              <p>
                {s.firstNumber && s.endNumber
                  ? `${formatDocNumber(s.firstNumber)} – ${formatDocNumber(s.endNumber)}. `
                  : `${t("admin.numberingDefault")} `}
                {t("admin.numberingLocked")}
              </p>
            ) : (
              <div className="grid-2">
                <div className="field">
                  <label htmlFor={`num-${s.series}-first`}>{t("admin.numberingFirst")}</label>
                  <input
                    id={`num-${s.series}-first`}
                    inputMode="numeric"
                    value={draft.first}
                    onChange={(e) =>
                      setDrafts({ ...drafts, [s.series]: { ...draft, first: e.target.value } })
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor={`num-${s.series}-end`}>{t("admin.numberingEnd")}</label>
                  <input
                    id={`num-${s.series}-end`}
                    inputMode="numeric"
                    value={draft.end}
                    onChange={(e) => setDrafts({ ...drafts, [s.series]: { ...draft, end: e.target.value } })}
                  />
                </div>
              </div>
            )}
            {s.lastIssued ? (
              <p className="note">
                {t("admin.numberingState", {
                  last: formatDocNumber(s.lastIssued),
                  remaining: s.remaining.toLocaleString("bg-BG"),
                })}
              </p>
            ) : !s.locked && !s.firstNumber ? (
              <p className="note">{t("admin.numberingDefault")}</p>
            ) : null}
            {s.remaining < size * LOW_SHARE ? (
              <p className="warning" role="alert">
                {t("admin.numberingLow")}
              </p>
            ) : null}
            {s.locked ? null : (
              <div className="row">
                <button type="button" className="btn" onClick={() => save(s.series)}>
                  {t("admin.save")}
                </button>
              </div>
            )}
          </div>
        );
      })}
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
