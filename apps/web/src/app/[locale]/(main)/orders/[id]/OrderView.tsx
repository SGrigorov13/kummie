"use client";

import {
  CUSTOMER_STEPS,
  customerStepNumber,
  formatMoney,
  isOffTrack,
  nextHappyStatus,
} from "@kummie/core";
import { useDemoStore } from "@/lib/demo-store";
import { useLocale, useT } from "@/lib/locale";

export function OrderView({ id }: { id: string }) {
  const t = useT();
  const locale = useLocale();
  const { state, hydrated, advance } = useDemoStore();
  if (!hydrated) return null;

  const order = state.orders.find((item) => item.id === id);
  if (!order) {
    return (
      <div className="wrap section">
        <p>{t("noOrders")}</p>
      </div>
    );
  }

  const current = customerStepNumber(order.status) ?? 0;

  return (
    <div className="wrap section">
      <p className="label">{t("order")}</p>
      <h1>{order.id}</h1>
      <p className="muted">{t("localNote")}</p>
      {isOffTrack(order.status) ? (
        <p className="notice">{t(`status.${order.status}`)}</p>
      ) : (
        <>
          <p className="label">{t("stepOf", { n: current })}</p>
          <ol className="steps">
            {CUSTOMER_STEPS.map((step, index) => {
              const done = index + 1 <= current;
              return (
                <li key={step} className={done ? "steps__item steps__item--done" : "steps__item"} aria-current={index + 1 === current ? "step" : undefined}>
                  <span className="steps__n" aria-hidden="true">
                    {index + 1}
                  </span>
                  {t(`step.${step}`)}
                </li>
              );
            })}
          </ol>
        </>
      )}
      {nextHappyStatus(order.status) ? (
        <button type="button" className="btn" onClick={() => advance(order.id)}>
          {t("advance")}
        </button>
      ) : null}
      <ul className="lines">
        {order.lines.map((line) => (
          <li key={line.productId} className="line">
            <span>
              {line.qty} × {line.title}
            </span>
          </li>
        ))}
      </ul>
      <p>
        {order.name}, {order.city}, {t(`country.${order.country}`)} · {t("total")}:{" "}
        <strong>{formatMoney(order.quote.totalCents, locale)}</strong>
      </p>
    </div>
  );
}
