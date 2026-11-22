import type { ImportIssue, ProductImportReport } from "@kummie/contracts";
import type { MessageKey } from "@kummie/i18n";
import { useState, type ChangeEvent } from "react";
import { api, useAdmin } from "./context";

/** Excel saves "CSV UTF-8" or, in a Bulgarian Windows, CSV in windows-1251 — read both. */
async function readCsv(file: File): Promise<string> {
  const bytes = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1251").decode(bytes);
  }
}

/**
 * Admin → Каталог → Импорт от файл: download the template, choose the filled-in file, check it
 * (nothing is written), then import everything or nothing.
 */
export function ImportPanel({ onDone }: { onDone: () => void }) {
  const { t } = useAdmin();
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [report, setReport] = useState<ProductImportReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setReport(null);
    setError(null);
    if (!file) return;
    setFileName(file.name);
    const text = await readCsv(file);
    setCsv(text);
    await run(text, true);
  }

  async function run(text: string, dryRun: boolean) {
    setBusy(true);
    setError(null);
    try {
      const result = await api.importProducts(text, dryRun);
      setReport(result);
      if (result.applied) onDone();
    } catch (e) {
      setError(t("admin.saveFailed", { message: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy(false);
    }
  }

  const problem = (issue: ImportIssue) =>
    `${t(`admin.import.code.${issue.code}` as MessageKey)}${issue.value ? `: ${issue.value}` : ""}`;
  const field = (key: string) => t(`admin.field.${key}` as MessageKey);

  return (
    <section className="panel stack">
      <h2>{t("admin.import.title")}</h2>
      <p className="note">{t("admin.import.lead")}</p>
      <div className="row">
        <a className="btn btn--secondary" href={api.importTemplateUrl()}>
          {t("admin.import.template")}
        </a>
        <label className="btn">
          {t("admin.import.choose")}
          <input type="file" accept=".csv,text/csv" onChange={choose} hidden />
        </label>
        {fileName ? <span className="note">{fileName}</span> : null}
      </div>
      {busy ? <p>{t("admin.loading")}</p> : null}
      {error ? (
        <p className="note" role="alert">
          {error}
        </p>
      ) : null}

      {report && report.issues.length > 0 ? (
        <>
          <p className="note" role="alert">
            {t("admin.import.issues", { count: report.issues.length })}
          </p>
          <table className="table">
            <thead>
              <tr>
                <th>{t("admin.import.colLine")}</th>
                <th>{t("admin.import.colColumn")}</th>
                <th>{t("admin.import.colProblem")}</th>
              </tr>
            </thead>
            <tbody>
              {report.issues.slice(0, 200).map((issue, i) => (
                <tr key={`${issue.line}-${issue.column}-${i}`}>
                  <td>{issue.line}</td>
                  <td>{issue.column ?? "—"}</td>
                  <td>{problem(issue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}

      {report && report.products.length > 0 ? (
        <>
          <p role="status">
            {report.applied
              ? t("admin.import.done", { count: report.products.length })
              : report.issues.length === 0
                ? t("admin.import.ok")
                : null}
          </p>
          <table className="table">
            <thead>
              <tr>
                <th>{t("admin.colTitle")}</th>
                <th>{t("admin.import.colAction")}</th>
                <th>{t("admin.import.colVariants")}</th>
                <th>{t("admin.colStatus")}</th>
              </tr>
            </thead>
            <tbody>
              {report.products.map((p) => (
                <tr key={p.slug}>
                  <td>
                    {p.title || p.slug} <span className="note">({p.slug})</span>
                  </td>
                  <td>{t(p.action === "create" ? "admin.import.create" : "admin.import.update")}</td>
                  <td>{p.variants}</td>
                  <td>
                    {report.applied && p.status
                      ? // After the import: the real status, and what is still missing for a draft.
                        `${t(`admin.status.${p.status}` as MessageKey)}${
                          p.missing.length > 0
                            ? ` — ${t("admin.import.missing", { fields: p.missing.map(field).join(", ") })}`
                            : ""
                        }`
                      : p.missing.length === 0
                        ? t(p.publish ? "admin.import.willPublish" : "admin.import.complete")
                        : t("admin.import.staysDraft", { fields: p.missing.map(field).join(", ") })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!report.applied && report.issues.length === 0 && csv ? (
            <button type="button" className="btn" disabled={busy} onClick={() => run(csv, false)}>
              {t("admin.import.apply", { count: report.products.length })}
            </button>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
