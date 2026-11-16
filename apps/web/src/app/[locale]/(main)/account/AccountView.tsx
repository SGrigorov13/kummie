"use client";

import { customerStepNumber } from "@kummie/core";
import Link from "next/link";
import { Field } from "@/components/Field";
import { useDemoStore, type Alerts } from "@/lib/demo-store";
import { useLocale, useT } from "@/lib/locale";
import { href } from "@/lib/paths";

/** Four separate opt-ins (D-007/CLAUDE.md). Order status is transactional, never bundled. */
const ALERTS: { key: keyof Alerts; label: "comebacks" | "restocks" | "orderAlerts" | "drops" }[] = [
  { key: "comebacks", label: "comebacks" },
  { key: "restocks", label: "restocks" },
  { key: "orders", label: "orderAlerts" },
  { key: "drops", label: "drops" },
];

export function AccountView() {
  const t = useT();
  const locale = useLocale();
  const { state, hydrated, setName, toggleAlert, reset } = useDemoStore();
  if (!hydrated) return null;
  return (
    <>
      <Field
        id="account-name"
        label={t("name")}
        autoComplete="name"
        value={state.name}
        onChange={(event) => setName(event.target.value)}
      />
      <fieldset className="fieldset">
        <legend className="h3">{t("alerts")}</legend>
        <p className="muted">{t("quiet")}</p>
        {ALERTS.map(({ key, label }) => (
          <label key={key} className="check">
            <input type="checkbox" checked={state.alerts[key]} onChange={() => toggleAlert(key)} />
            {t(label)}
          </label>
        ))}
        <p className="muted">{t("orderAlertsNote")}</p>
      </fieldset>
      <h2 className="h3">{t("orders")}</h2>
      {state.orders.length === 0 ? (
        <p>{t("noOrders")}</p>
      ) : (
        <ul className="history">
          {state.orders.map((order) => (
            <li key={order.id}>
              <Link href={href(locale, `/orders/${order.id}`)}>{order.id}</Link> ·{" "}
              {t("stepOf", { n: customerStepNumber(order.status) ?? 0 })}
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="btn btn--secondary" onClick={reset}>
        {t("reset")}
      </button>
    </>
  );
}
