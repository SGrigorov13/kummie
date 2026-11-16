"use client";

import {
  formatMoney,
  KUMMIES_REDEEM_COST,
  KUMMIES_REDEEM_CENTS,
  KUMMIES_VALIDITY_DAYS,
  kummiesBalance,
  nextKummiesExpiry,
  type Locale,
} from "@kummie/core";
import { useDemoStore } from "@/lib/demo-store";
import { useLocale, useT } from "@/lib/locale";

function formatDay(isoDay: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "bg" ? "bg-BG" : "en-GB", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(`${isoDay}T00:00:00Z`));
}

export function ClubView() {
  const t = useT();
  const locale = useLocale();
  const { state, hydrated, today, setAge, redeem } = useDemoStore();
  if (!hydrated) return null;

  const balance = kummiesBalance(state.kummieLots, today);
  const expiry = nextKummiesExpiry(state.kummieLots, today);

  return (
    <>
      <p className="kummies">
        <span className="label">{t("kummies")}</span>
        <strong>{balance}</strong>
      </p>
      <p className="muted">{t("kummiesValidity", { days: KUMMIES_VALIDITY_DAYS })}</p>
      {expiry ? (
        <p className="notice">
          {t("kummiesExpiring", { count: expiry.count, date: formatDay(expiry.validUntil, locale) })}
        </p>
      ) : null}
      {state.age === "unknown" ? (
        <div className="panel">
          <h2 className="h3">{t("ageTitle")}</h2>
          <p>{t("ageNote")}</p>
          <div className="row">
            <button type="button" className="btn btn--secondary" onClick={() => setAge("under18")}>
              {t("ageUnder")}
            </button>
            <button type="button" className="btn btn--secondary" onClick={() => setAge("18plus")}>
              {t("ageOver")}
            </button>
          </div>
        </div>
      ) : (
        <p>{state.age === "under18" ? t("ageNote") : t("saved")}</p>
      )}
      <button type="button" className="btn" disabled={balance < KUMMIES_REDEEM_COST} onClick={redeem}>
        {t("redeem", { cost: KUMMIES_REDEEM_COST, amount: formatMoney(KUMMIES_REDEEM_CENTS, locale) })}
      </button>
      {state.history.length > 0 ? (
        <>
          <h2 className="h3">{t("history")}</h2>
          <ul className="history">
            {state.history.map((item) => (
              <li key={item.id}>
                <b>{item.delta > 0 ? `+${item.delta}` : item.delta}</b>{" "}
                {item.kind === "earn"
                  ? t("earnNote", { id: item.orderId, date: formatDay(item.validUntil, locale) })
                  : t("redeemNote", { amount: formatMoney(item.creditCents, locale) })}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </>
  );
}
