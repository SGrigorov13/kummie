import type { PackingSlip } from "@kummie/contracts";
import { translator, type MessageKey } from "@kummie/i18n";
import { createPortal } from "react-dom";

/**
 * The A4 packing list that goes into the parcel (D-065), in the customer's language. Rendered
 * straight into <body> and visible only when printing (admin.css hides the rest of the admin).
 * Text only: no artist images or logos (CLAUDE.md), nothing about other customers.
 */
export function PackingSlipPrint({ slip }: { slip: PackingSlip }) {
  const t = translator(slip.locale);
  const date = new Date(slip.orderedAt).toLocaleDateString(slip.locale === "bg" ? "bg-BG" : "en-GB", {
    timeZone: "Europe/Sofia",
  });
  const a = slip.returnAddress;
  return createPortal(
    <article className="print-slip" lang={slip.locale}>
      <header className="print-slip__head">
        <strong className="print-slip__brand">KUMMIE</strong>
        <h1>{t("packingSlip.title")}</h1>
        <p>{t("packingSlip.order", { number: slip.orderNumber, date })}</p>
        <p>
          {t("packingSlip.for", { name: slip.recipient.name, city: slip.recipient.city })},{" "}
          {t(`country.${slip.recipient.country}` as MessageKey)}
        </p>
      </header>

      <table>
        <thead>
          <tr>
            <th>{t("packingSlip.sku")}</th>
            <th>{t("packingSlip.product")}</th>
            <th>{t("packingSlip.version")}</th>
            <th>{t("packingSlip.qty")}</th>
          </tr>
        </thead>
        <tbody>
          {slip.lines.map((l) => (
            <tr key={l.sku}>
              <td>{l.sku}</td>
              <td>{l.title}</td>
              <td>{l.version}</td>
              <td>{l.qty}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p>{t("packingSlip.thanks")}</p>

      {slip.safety.length > 0 ? (
        <section>
          <h2>{t("packingSlip.safetyTitle")}</h2>
          {slip.safety.map((s) => (
            <div key={s.title}>
              <h3>{s.title}</h3>
              {s.info ? <p>{s.info}</p> : null}
              {s.warnings.length > 0 ? (
                <ul>
                  {s.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </section>
      ) : null}

      <section>
        <h2>{t("packingSlip.withdrawalTitle", { days: slip.withdrawalDays })}</h2>
        <p>{t("packingSlip.withdrawalText", { days: slip.withdrawalDays, url: slip.withdrawalUrl })}</p>
        <p>{t("packingSlip.orderPage", { url: slip.orderUrl })}</p>
      </section>

      {a ? (
        <section>
          <h2>{t("packingSlip.returnTitle")}</h2>
          <p>
            {a.name}
            <br />
            {a.line1}
            <br />
            {a.postcode} {a.city}, {t("country.BG")}
          </p>
        </section>
      ) : null}
    </article>,
    document.body,
  );
}
