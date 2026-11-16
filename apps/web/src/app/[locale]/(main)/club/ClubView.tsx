"use client";

import { KUMMIES_REDEEM_COST } from "@kummie/core";
import { useDemoStore } from "@/lib/demo-store";
import { useT } from "@/lib/locale";

export function ClubView() {
  const t = useT();
  const { state, hydrated, setAge, redeem } = useDemoStore();
  if (!hydrated) return null;
  return (
    <>
      <p className="kummies">
        <span className="label">{t("kummies")}</span>
        <strong>{state.kummies}</strong>
      </p>
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
      <button type="button" className="btn" disabled={state.kummies < KUMMIES_REDEEM_COST} onClick={redeem}>
        {t("redeem")}
      </button>
      {state.history.length > 0 ? (
        <>
          <h2 className="h3">{t("history")}</h2>
          <ul className="history">
            {state.history.map((item) => (
              <li key={item.id}>
                <b>{item.delta > 0 ? `+${item.delta}` : item.delta}</b>{" "}
                {item.kind === "earn" ? t("earnNote", { id: item.orderId }) : t("redeemNote")}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </>
  );
}
