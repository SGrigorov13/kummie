import {
  ApiRequestError,
  type AdminProduct,
  type Category,
  type Group,
  type ProductInput,
} from "@kummie/contracts";
import {
  badgeSpec,
  missingComplianceFields,
  parseEuroToCents,
  type ComplianceField,
  type Country,
  type Localized,
} from "@kummie/core";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { api, centsToEuroInput, useAdmin } from "./context";

const SOURCING = ["OFFICIAL", "KUMMIE_ORIGINAL", "LICENSED", "SUPPLIER_DIRECT"] as const;
const STATES = ["NEW_DROP", "IN_STOCK_EU", "PRE_ORDER"] as const;
const REGIONS: Country[] = ["BG", "RO", "GR", "PL"];

type VariantRow = { id?: string; version: string; sku: string; price: string; active: boolean };

const EMPTY: ProductInput = {
  slug: "",
  title: "",
  summary: { bg: "", en: "" },
  subcategoryId: "",
  groupId: null,
  sourcing: "KUMMIE_ORIGINAL",
  state: null,
  isLimited: false,
  variants: [],
  compliance: {
    dispatchEstimate: { bg: "", en: "" },
    deliveryRegions: ["BG", "RO", "GR"],
    manufacturer: "",
    euResponsiblePerson: "",
    safetyInfo: null,
    warnings: [],
    safetyNone: false,
    returnExceptions: [],
    returnExceptionsNone: false,
  },
};

function toForm(p: AdminProduct): ProductInput {
  const { id: _id, status: _s, isDemo: _d, updatedAt: _u, missing: _m, ...input } = p;
  return input;
}

function toRows(p: AdminProduct): VariantRow[] {
  return p.variants.map((v) => ({
    ...(v.id ? { id: v.id } : {}),
    version: v.version,
    sku: v.sku,
    price: centsToEuroInput(v.priceCents),
    active: v.active,
  }));
}

/** Create or edit one product, with a live GPSR checklist that mirrors the server's gate. */
export function ProductEditor({
  id,
  onClose,
  onCreated,
}: {
  id: string | "new";
  onClose: () => void;
  /** Called once a new product has been saved, so the shell can switch to editing it. */
  onCreated?: (id: string) => void;
}) {
  const { t, locale } = useAdmin();
  const [product, setProduct] = useState<AdminProduct | null>(null);
  const [form, setForm] = useState<ProductInput>(EMPTY);
  const [rows, setRows] = useState<VariantRow[]>([{ version: "", sku: "", price: "", active: true }]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [serverMissing, setServerMissing] = useState<ComplianceField[]>([]);
  const [busy, setBusy] = useState(false);
  // The product already in state (just created here) need not be fetched again.
  const loaded = useRef<string | null>(null);

  useEffect(() => {
    api.categories().then((r) => setCategories(r.items));
    api.groups().then((r) => setGroups(r.items));
    if (id !== "new" && loaded.current !== id) {
      api.getProduct(id).then((p) => {
        loaded.current = p.id;
        setProduct(p);
        setForm(toForm(p));
        setRows(toRows(p));
      });
    }
  }, [id]);

  const variants = useMemo(
    () =>
      rows.map((r) => ({
        ...(r.id ? { id: r.id } : {}),
        version: r.version,
        sku: r.sku.trim().toUpperCase(),
        priceCents: parseEuroToCents(r.price) ?? 0,
        active: r.active,
      })),
    [rows],
  );

  const missing = useMemo(() => {
    const c = form.compliance;
    const active = variants.filter((v) => v.active);
    return missingComplianceFields({
      title: form.title,
      sourcing: form.sourcing,
      state: form.state,
      isLimited: form.isLimited,
      versions: active.map((v) => v.version),
      pricesCents: active.map((v) => v.priceCents),
      dispatchEstimate: c.dispatchEstimate,
      deliveryRegions: c.deliveryRegions,
      manufacturer: c.manufacturer,
      euResponsiblePerson: c.euResponsiblePerson,
      safetyInfo: c.safetyInfo,
      warnings: c.warnings,
      safetyNone: c.safetyNone,
      returnExceptions: c.returnExceptions,
      returnExceptionsNone: c.returnExceptionsNone,
    });
  }, [form, variants]);

  const set = <K extends keyof ProductInput>(key: K, value: ProductInput[K]) =>
    setForm({ ...form, [key]: value });
  const setC = <K extends keyof ProductInput["compliance"]>(key: K, value: ProductInput["compliance"][K]) =>
    setForm({ ...form, compliance: { ...form.compliance, [key]: value } });

  function explain(e: unknown): string {
    if (e instanceof ApiRequestError) {
      if (e.status === 409) return t("admin.editor.conflict");
      if (e.status === 422) {
        setServerMissing(
          ((e.body as unknown as { missing?: ComplianceField[] })?.missing ?? []) as ComplianceField[],
        );
        return t("admin.editor.publishBlocked");
      }
      return t("admin.saveFailed", { message: e.message });
    }
    return t("admin.saveFailed", { message: String(e) });
  }

  async function save(event?: FormEvent): Promise<AdminProduct | null> {
    event?.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const input: ProductInput = { ...form, variants };
      const saved = product ? await api.updateProduct(product.id, input) : await api.createProduct(input);
      // Take the saved variant ids, or the next save would try to create the same SKUs again.
      loaded.current = saved.id;
      setProduct(saved);
      setForm(toForm(saved));
      setRows(toRows(saved));
      if (!product) onCreated?.(saved.id);
      setServerMissing([]);
      setMessage({ kind: "ok", text: t("admin.saved") });
      return saved;
    } catch (e) {
      setMessage({ kind: "error", text: explain(e) });
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function publish(publishIt: boolean) {
    const saved = await save();
    if (!saved) return;
    setBusy(true);
    try {
      const next = publishIt ? await api.publishProduct(saved.id) : await api.unpublishProduct(saved.id);
      setProduct(next);
      setMessage({ kind: "ok", text: t(`admin.status.${next.status}`) });
    } catch (e) {
      setMessage({ kind: "error", text: explain(e) });
    } finally {
      setBusy(false);
    }
  }

  const shown = [...new Set([...missing, ...serverMissing])];
  const flag = (f: ComplianceField) => (shown.includes(f) ? "field field--missing" : "field");

  const localizedList = (
    label: string,
    list: Localized[],
    onChange: (next: Localized[]) => void,
    addLabel: string,
  ): ReactNode => (
    <fieldset className="fieldset">
      <legend>{label}</legend>
      {list.map((item, i) => (
        <div className="grid-2 list-item" key={i}>
          <textarea
            aria-label={t("admin.editor.textBg")}
            value={item.bg}
            onChange={(e) => onChange(list.map((x, j) => (j === i ? { ...x, bg: e.target.value } : x)))}
          />
          <textarea
            aria-label={t("admin.editor.textEn")}
            value={item.en}
            onChange={(e) => onChange(list.map((x, j) => (j === i ? { ...x, en: e.target.value } : x)))}
          />
          <button
            type="button"
            className="link-button"
            onClick={() => onChange(list.filter((_, j) => j !== i))}
          >
            {t("admin.editor.remove")}
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn btn--secondary"
        onClick={() => onChange([...list, { bg: "", en: "" }])}
      >
        {addLabel}
      </button>
    </fieldset>
  );

  return (
    <div className="editor">
      <form className="editor__form stack" onSubmit={save}>
        <button type="button" className="link-button" onClick={onClose}>
          ← {t("admin.products")}
        </button>
        {product?.isDemo ? <p className="note">{t("admin.editor.demoNote")}</p> : null}

        <section className="panel stack">
          <h2>{t("admin.editor.basics")}</h2>
          <div className={flag("title")}>
            <label htmlFor="p-title">{t("admin.editor.title")}</label>
            <input id="p-title" value={form.title} onChange={(e) => set("title", e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="p-slug">{t("admin.editor.slug")}</label>
            <input
              id="p-slug"
              value={form.slug}
              onChange={(e) => set("slug", e.target.value.toLowerCase())}
            />
          </div>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="p-sum-bg">{t("admin.editor.summaryBg")}</label>
              <textarea
                id="p-sum-bg"
                value={form.summary.bg}
                onChange={(e) => set("summary", { ...form.summary, bg: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="p-sum-en">{t("admin.editor.summaryEn")}</label>
              <textarea
                id="p-sum-en"
                value={form.summary.en}
                onChange={(e) => set("summary", { ...form.summary, en: e.target.value })}
              />
            </div>
          </div>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="p-sub">{t("admin.editor.subcategory")}</label>
              <select
                id="p-sub"
                value={form.subcategoryId}
                onChange={(e) => set("subcategoryId", e.target.value)}
              >
                <option value="">—</option>
                {categories.map((c) => (
                  <optgroup key={c.id} label={c[locale]}>
                    {c.subcategories.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s[locale]}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="p-group">{t("admin.editor.group")}</label>
              <select
                id="p-group"
                value={form.groupId ?? ""}
                onChange={(e) => set("groupId", e.target.value || null)}
              >
                <option value="">{t("admin.editor.noGroup")}</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} · {g.generation}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid-2">
            <div className={flag("sourcing")}>
              <label htmlFor="p-sourcing">{t("admin.editor.sourcing")}</label>
              <select
                id="p-sourcing"
                value={form.sourcing}
                onChange={(e) => set("sourcing", e.target.value as ProductInput["sourcing"])}
              >
                {SOURCING.map((s) => (
                  <option key={s} value={s}>
                    {badgeSpec(s)[locale]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="p-state">{t("admin.editor.state")}</label>
              <select
                id="p-state"
                value={form.state ?? ""}
                onChange={(e) => set("state", (e.target.value || null) as ProductInput["state"])}
              >
                <option value="">{t("admin.editor.noState")}</option>
                {STATES.map((s) => (
                  <option key={s} value={s}>
                    {badgeSpec(s)[locale]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={form.isLimited}
              onChange={(e) => set("isLimited", e.target.checked)}
            />
            {t("admin.editor.limited")}
          </label>
        </section>

        <section
          className={`panel stack ${shown.includes("version") || shown.includes("price") ? "panel--missing" : ""}`}
        >
          <h2>{t("admin.editor.variants")}</h2>
          <table className="table">
            <thead>
              <tr>
                <th>{t("admin.editor.version")}</th>
                <th>{t("admin.editor.sku")}</th>
                <th>{t("admin.editor.price")}</th>
                <th>{t("admin.editor.active")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const update = (patch: Partial<VariantRow>) =>
                  setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
                return (
                  <tr key={row.id ?? `new-${i}`}>
                    <td>
                      <input
                        aria-label={t("admin.editor.version")}
                        value={row.version}
                        onChange={(e) => update({ version: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        aria-label={t("admin.editor.sku")}
                        value={row.sku}
                        onChange={(e) => update({ sku: e.target.value.toUpperCase() })}
                      />
                    </td>
                    <td>
                      <input
                        aria-label={t("admin.editor.price")}
                        inputMode="decimal"
                        value={row.price}
                        onChange={(e) => update({ price: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={t("admin.editor.active")}
                        checked={row.active}
                        onChange={(e) => update({ active: e.target.checked })}
                      />
                    </td>
                    <td>
                      {row.id ? null : (
                        <button
                          type="button"
                          className="link-button"
                          onClick={() => setRows(rows.filter((_, j) => j !== i))}
                        >
                          {t("admin.editor.remove")}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => setRows([...rows, { version: "", sku: "", price: "", active: true }])}
          >
            {t("admin.editor.addVariant")}
          </button>
        </section>

        <section className="panel stack">
          <h2>{t("admin.editor.compliance")}</h2>
          <div className={`grid-2 ${flag("dispatchEstimate")}`}>
            <div>
              <label htmlFor="p-dis-bg">{t("admin.editor.dispatchBg")}</label>
              <input
                id="p-dis-bg"
                value={form.compliance.dispatchEstimate.bg}
                onChange={(e) =>
                  setC("dispatchEstimate", { ...form.compliance.dispatchEstimate, bg: e.target.value })
                }
              />
            </div>
            <div>
              <label htmlFor="p-dis-en">{t("admin.editor.dispatchEn")}</label>
              <input
                id="p-dis-en"
                value={form.compliance.dispatchEstimate.en}
                onChange={(e) =>
                  setC("dispatchEstimate", { ...form.compliance.dispatchEstimate, en: e.target.value })
                }
              />
            </div>
          </div>
          <fieldset className={`fieldset ${flag("deliveryRegions")}`}>
            <legend>{t("admin.editor.regions")}</legend>
            <div className="row">
              {REGIONS.map((r) => (
                <label key={r} className="check">
                  <input
                    type="checkbox"
                    checked={form.compliance.deliveryRegions.includes(r)}
                    onChange={(e) =>
                      setC(
                        "deliveryRegions",
                        e.target.checked
                          ? [...form.compliance.deliveryRegions, r]
                          : form.compliance.deliveryRegions.filter((x) => x !== r),
                      )
                    }
                  />
                  {t(`country.${r}`)}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid-2">
            <div className={flag("manufacturer")}>
              <label htmlFor="p-man">{t("admin.editor.manufacturer")}</label>
              <input
                id="p-man"
                value={form.compliance.manufacturer}
                onChange={(e) => setC("manufacturer", e.target.value)}
              />
            </div>
            <div className={flag("euResponsiblePerson")}>
              <label htmlFor="p-resp">{t("admin.field.euResponsiblePerson")}</label>
              <input
                id="p-resp"
                value={form.compliance.euResponsiblePerson}
                onChange={(e) => setC("euResponsiblePerson", e.target.value)}
              />
            </div>
          </div>
          <div className={shown.includes("safety") ? "stack panel--missing" : "stack"}>
            <div className="grid-2">
              <div className="field">
                <label htmlFor="p-saf-bg">{t("admin.editor.safetyBg")}</label>
                <textarea
                  id="p-saf-bg"
                  value={form.compliance.safetyInfo?.bg ?? ""}
                  onChange={(e) => {
                    const next = { bg: e.target.value, en: form.compliance.safetyInfo?.en ?? "" };
                    setC("safetyInfo", next.bg || next.en ? next : null);
                  }}
                />
              </div>
              <div className="field">
                <label htmlFor="p-saf-en">{t("admin.editor.safetyEn")}</label>
                <textarea
                  id="p-saf-en"
                  value={form.compliance.safetyInfo?.en ?? ""}
                  onChange={(e) => {
                    const next = { bg: form.compliance.safetyInfo?.bg ?? "", en: e.target.value };
                    setC("safetyInfo", next.bg || next.en ? next : null);
                  }}
                />
              </div>
            </div>
            {localizedList(
              t("admin.editor.warnings"),
              form.compliance.warnings,
              (next) => setC("warnings", next),
              t("admin.editor.addWarning"),
            )}
            <label className="check">
              <input
                type="checkbox"
                checked={form.compliance.safetyNone}
                onChange={(e) => setC("safetyNone", e.target.checked)}
              />
              {t("admin.editor.safetyNone")}
            </label>
          </div>
          <div className={shown.includes("returnExceptions") ? "stack panel--missing" : "stack"}>
            {localizedList(
              t("admin.editor.returns"),
              form.compliance.returnExceptions,
              (next) => setC("returnExceptions", next),
              t("admin.editor.addReturn"),
            )}
            <label className="check">
              <input
                type="checkbox"
                checked={form.compliance.returnExceptionsNone}
                onChange={(e) => setC("returnExceptionsNone", e.target.checked)}
              />
              {t("admin.editor.returnsNone")}
            </label>
          </div>
        </section>
      </form>

      <aside className="editor__side panel stack" aria-live="polite">
        <h2>{t("admin.editor.checklist")}</h2>
        {product ? (
          <span className={`status status--${product.status}`}>{t(`admin.status.${product.status}`)}</span>
        ) : null}
        {shown.length === 0 ? (
          <p className="ok">✓ {t("admin.editor.ready")}</p>
        ) : (
          <ul className="checklist">
            {shown.map((f) => (
              <li key={f}>{t(`admin.field.${f}`)}</li>
            ))}
          </ul>
        )}
        {message ? (
          <p className={message.kind === "ok" ? "ok" : "error"} role="status">
            {message.text}
          </p>
        ) : null}
        <button type="button" className="btn btn--secondary" disabled={busy} onClick={() => save()}>
          {t("admin.save")}
        </button>
        {product?.status === "published" ? (
          <button type="button" className="btn btn--secondary" disabled={busy} onClick={() => publish(false)}>
            {t("admin.editor.unpublish")}
          </button>
        ) : (
          <button
            type="button"
            className="btn"
            disabled={busy || missing.length > 0}
            onClick={() => publish(true)}
          >
            {t("admin.editor.publish")}
          </button>
        )}
      </aside>
    </div>
  );
}
