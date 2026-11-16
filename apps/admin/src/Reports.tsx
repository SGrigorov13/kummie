import type { CompanySettings } from "@kummie/contracts";
import { useEffect, useState } from "react";
import { api, useAdmin } from "./context";

/** Previous calendar month in Sofia — the month the НАП file is due for. */
function previousMonth(): { year: number; month: number } {
  const now = new Date();
  const month = now.getMonth() === 0 ? 12 : now.getMonth();
  return { year: now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear(), month };
}

/**
 * Admin → Отчети за НАП: the monthly audit file (Приложение № 38), the sales journal for the
 * accountant and the quarterly OSS figures. Downloads are direct links; the staff cookie goes along.
 */
export function Reports() {
  const { t } = useAdmin();
  const initial = previousMonth();
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);
  const [company, setCompany] = useState<CompanySettings | null>(null);

  useEffect(() => {
    api.getCompany().then(setCompany, () => setCompany(null));
  }, []);

  const missing = company
    ? [
        !company.eik ? t("admin.eik") : null,
        !company.napEShopNumber && !company.napRfNumber ? t("admin.napEShop") : null,
        !company.vatNumber ? t("admin.vatNumber") : null,
      ].filter((x): x is string => !!x)
    : [];
  const quarter = Math.ceil(month / 3);
  const years = [initial.year - 1, initial.year, initial.year + 1];

  return (
    <div className="stack">
      <section className="panel stack">
        <div className="row">
          <label>
            {t("admin.reports.month")}{" "}
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {String(m).padStart(2, "0")}
                </option>
              ))}
            </select>
          </label>
          <select
            aria-label={t("admin.reports.year")}
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        {missing.length > 0 ? (
          <p className="note" role="alert">
            {t("admin.reports.missing", { fields: missing.join(", ") })}
          </p>
        ) : null}
        <a className="btn" href={api.reportUrl("nap-audit", year, month)}>
          {t("admin.reports.napAudit")}
        </a>
        <p className="note">{t("admin.reports.napNote")}</p>
        <p className="note">{t("admin.reports.confirm")}</p>
      </section>
      <section className="panel stack">
        <a className="btn btn--secondary" href={api.reportUrl("sales", year, month)}>
          {t("admin.reports.sales")}
        </a>
        <a className="btn btn--secondary" href={api.ossReportUrl(year, quarter)}>
          {t("admin.reports.oss", { quarter, year })}
        </a>
      </section>
    </div>
  );
}
