import { ApiRequestError, CompanySettings as Settings } from "@kummie/contracts";
import { parseEuroToCents } from "@kummie/core";
import { useEffect, useState, type FormEvent } from "react";
import { api, centsToEuroInput, useAdmin } from "./context";
import { NumberingSettings } from "./NumberingSettings";

type TextKey = Exclude<keyof Settings, "deliveryFeesCents" | "invoiceRequestDays" | "courierDays">;

const FIELDS: { key: TextKey; label: Parameters<ReturnType<typeof useAdmin>["t"]>[0]; type?: string }[] = [
  { key: "legalName", label: "admin.legalName" },
  { key: "eik", label: "admin.eik" },
  { key: "vatNumber", label: "admin.vatNumber" },
  { key: "registeredAddress", label: "admin.registeredAddress" },
  { key: "contactEmail", label: "admin.contactEmail", type: "email" },
  { key: "contactPhone", label: "admin.contactPhone", type: "tel" },
  { key: "iban", label: "admin.iban" },
  { key: "euResponsiblePerson", label: "admin.euResponsible" },
  { key: "ossEffectiveFrom", label: "admin.ossDate", type: "date" },
];

const NAP: typeof FIELDS = [
  { key: "napRfNumber", label: "admin.napRf" },
  { key: "napEShopNumber", label: "admin.napEShop" },
  { key: "napRegisteredOn", label: "admin.napDate", type: "date" },
];

const COUNTRIES = ["BG", "RO", "GR"] as const;

/** Settings → Company: trader data, НАП numbers, OSS date, delivery fees (admin only). */
export function CompanySettings() {
  const { t } = useAdmin();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [fees, setFees] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [invalid, setInvalid] = useState<string[]>([]);

  useEffect(() => {
    api.getCompany().then((s) => {
      setSettings(s);
      setFees(Object.fromEntries(COUNTRIES.map((c) => [c, centsToEuroInput(s.deliveryFeesCents[c])])));
    });
  }, []);

  if (!settings) return <p>{t("admin.loading")}</p>;

  const setText = (key: TextKey, value: string) =>
    setSettings({ ...settings, [key]: value.trim() === "" ? null : value });

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!settings) return;
    const deliveryFeesCents = Object.fromEntries(
      COUNTRIES.map((c) => [c, parseEuroToCents(fees[c] ?? "") ?? settings.deliveryFeesCents[c]]),
    ) as Settings["deliveryFeesCents"];
    // Check here first, so staff see which field is wrong in their own language.
    const checked = Settings.safeParse({ ...settings, deliveryFeesCents });
    if (!checked.success) {
      const keys = [...new Set(checked.error.issues.map((i) => String(i.path[0])))];
      setInvalid(keys);
      const labels = [...FIELDS, ...NAP].filter((f) => keys.includes(f.key)).map((f) => t(f.label));
      if (keys.includes("deliveryFeesCents")) labels.push(t("admin.deliveryFees"));
      if (keys.includes("invoiceRequestDays")) labels.push(t("admin.invoiceRequestDays"));
      if (keys.includes("courierDays")) labels.push(t("admin.courierDays"));
      setMessage(t("admin.checkFields", { fields: labels.join(", ") }));
      return;
    }
    setInvalid([]);
    try {
      const saved = await api.saveCompany(checked.data);
      setSettings(saved);
      setMessage(t("admin.saved"));
    } catch (e) {
      setMessage(t("admin.saveFailed", { message: e instanceof ApiRequestError ? e.message : String(e) }));
    }
  }

  const field = ({ key, label, type }: (typeof FIELDS)[number]) => (
    <div className={invalid.includes(key) ? "field field--missing" : "field"} key={key}>
      <label htmlFor={`company-${key}`}>{t(label)}</label>
      <input
        id={`company-${key}`}
        type={type ?? "text"}
        value={settings[key] ?? ""}
        aria-invalid={invalid.includes(key) || undefined}
        onChange={(e) => setText(key, e.target.value)}
      />
    </div>
  );

  return (
    <>
      <form className="panel stack" onSubmit={save}>
        <p className="note">{t("admin.companyLead")}</p>
        <div className="grid-2">{FIELDS.map(field)}</div>
        <h2>{t("admin.napTitle")}</h2>
        <div className="grid-2">{NAP.map(field)}</div>
        <h2>{t("admin.deliveryFees")}</h2>
        <div className="grid-3">
          {COUNTRIES.map((c) => (
            <div className="field" key={c}>
              <label htmlFor={`fee-${c}`}>{t(`country.${c}`)}</label>
              <input
                id={`fee-${c}`}
                inputMode="decimal"
                value={fees[c] ?? ""}
                onChange={(e) => setFees({ ...fees, [c]: e.target.value })}
              />
            </div>
          ))}
        </div>
        <h2>{t("admin.courierDays")}</h2>
        <div className="grid-3">
          {COUNTRIES.map((c) => (
            <div className={invalid.includes("courierDays") ? "field field--missing" : "field"} key={c}>
              <label htmlFor={`courier-${c}`}>{t(`country.${c}`)}</label>
              <div className="row">
                <input
                  id={`courier-${c}`}
                  type="number"
                  min={0}
                  max={30}
                  style={{ width: 70 }}
                  value={settings.courierDays[c].min}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      courierDays: {
                        ...settings.courierDays,
                        [c]: { ...settings.courierDays[c], min: Number(e.target.value) || 0 },
                      },
                    })
                  }
                />
                –
                <input
                  aria-label={`${t(`country.${c}`)} max`}
                  type="number"
                  min={0}
                  max={30}
                  style={{ width: 70 }}
                  value={settings.courierDays[c].max}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      courierDays: {
                        ...settings.courierDays,
                        [c]: { ...settings.courierDays[c], max: Number(e.target.value) || 0 },
                      },
                    })
                  }
                />
              </div>
            </div>
          ))}
        </div>
        <div className={invalid.includes("invoiceRequestDays") ? "field field--missing" : "field"}>
          <label htmlFor="company-invoiceRequestDays">{t("admin.invoiceRequestDays")}</label>
          <input
            id="company-invoiceRequestDays"
            type="number"
            min={0}
            max={90}
            value={settings.invoiceRequestDays}
            onChange={(e) => setSettings({ ...settings, invoiceRequestDays: Number(e.target.value) })}
          />
        </div>
        <div className="row">
          <button type="submit" className="btn">
            {t("admin.save")}
          </button>
          {message ? <span role="status">{message}</span> : null}
        </div>
      </form>
      <NumberingSettings />
    </>
  );
}
