"use client";

import type { Account, Address, AddressInput, Preferences, ShippingCountry } from "@kummie/contracts";
import { customerStepNumber } from "@kummie/core";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Field } from "@/components/Field";
import { accountApi, commonErrorKey, statusOf } from "@/lib/account";
import { useDemoStore } from "@/lib/demo-store";
import { useLocale, useT } from "@/lib/locale";
import { href } from "@/lib/paths";

/** Four separate opt-ins (CLAUDE.md). Order status is transactional, never bundled with marketing. */
const ALERTS: {
  key: keyof Preferences["notifications"];
  label: "comebacks" | "restocks" | "orderAlerts" | "drops";
}[] = [
  { key: "comebacks", label: "comebacks" },
  { key: "restocks", label: "restocks" },
  { key: "orderStatus", label: "orderAlerts" },
  { key: "clubDrops", label: "drops" },
];
const COUNTRIES: ShippingCountry[] = ["BG", "RO", "GR"];
const EMPTY_ADDRESS: AddressInput = {
  name: "",
  line1: "",
  line2: null,
  city: "",
  postcode: "",
  country: "BG",
  phone: "",
  isDefault: false,
};

export function AccountView() {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [account, setAccount] = useState<Account | null>(null);

  useEffect(() => {
    accountApi.me().then(setAccount, (e: unknown) => {
      if (statusOf(e) === 401) router.replace(href(locale, "/signin"));
    });
  }, [locale, router]);

  if (!account) return <p role="status">…</p>;

  async function signOut() {
    await accountApi.signOut().catch(() => undefined);
    router.push(href(locale, "/"));
  }

  return (
    <>
      <div className="row">
        <p className="lede">{t("acct.hello", { name: account.name })}</p>
        <button type="button" className="btn btn--secondary btn--small" onClick={signOut}>
          {t("auth.signOut")}
        </button>
      </div>
      {account.minor ? <p className="notice">{t("acct.minorNote")}</p> : null}
      <ProfileSection account={account} onSaved={setAccount} />
      <PreferencesSection minor={account.minor} />
      <AddressesSection />
      <DemoOrders />
      <PrivacySection />
    </>
  );
}

function Saved({ text }: { text: string | null }) {
  return text ? (
    <p className="muted" role="status">
      {text}
    </p>
  ) : null;
}

function ProfileSection({ account, onSaved }: { account: Account; onSaved: (a: Account) => void }) {
  const t = useT();
  const [name, setName] = useState(account.name);
  const [language, setLanguage] = useState(account.locale);
  const [message, setMessage] = useState<string | null>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    try {
      onSaved(await accountApi.updateProfile({ name, locale: language }));
      setMessage(t("acct.saved"));
    } catch (e) {
      setMessage(t(commonErrorKey(e)));
    }
  }

  return (
    <form className="panel" onSubmit={save}>
      <h2 className="h3">{t("acct.profile")}</h2>
      <p className="muted">{account.email}</p>
      <Field
        id="account-name"
        label={t("name")}
        autoComplete="given-name"
        required
        maxLength={80}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <div className="field">
        <label htmlFor="account-language">{t("acct.language")}</label>
        <select
          id="account-language"
          value={language}
          onChange={(e) => setLanguage(e.target.value === "en" ? "en" : "bg")}
        >
          <option value="bg">Български</option>
          <option value="en">English</option>
        </select>
      </div>
      <button type="submit" className="btn btn--secondary">
        {t("acct.save")}
      </button>
      <Saved text={message} />
    </form>
  );
}

function PreferencesSection({ minor }: { minor: boolean }) {
  const t = useT();
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    accountApi.preferences().then(setPrefs, () => undefined);
  }, []);
  if (!prefs) return null;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!prefs) return;
    try {
      setPrefs(await accountApi.savePreferences(prefs));
      setMessage(t("acct.saved"));
    } catch (e) {
      setMessage(t(commonErrorKey(e)));
    }
  }

  return (
    <form className="panel" onSubmit={save}>
      <fieldset className="fieldset">
        <legend className="h3">{t("alerts")}</legend>
        <p className="muted">{t("quiet")}</p>
        {ALERTS.map(({ key, label }) => (
          <label key={key} className="check">
            <input
              type="checkbox"
              checked={prefs.notifications[key]}
              onChange={(e) =>
                setPrefs({ ...prefs, notifications: { ...prefs.notifications, [key]: e.target.checked } })
              }
            />
            {t(label)}
          </label>
        ))}
        <p className="muted">{t("orderAlertsNote")}</p>
        <p className="muted">{t("kummiesEmailNote")}</p>
        <label className="check">
          <input
            type="checkbox"
            disabled={minor}
            checked={prefs.personalisedAds}
            onChange={(e) => setPrefs({ ...prefs, personalisedAds: e.target.checked })}
          />
          {t("acct.ads")}
        </label>
        {minor ? <p className="muted">{t("acct.adsMinor")}</p> : null}
      </fieldset>
      <button type="submit" className="btn btn--secondary">
        {t("acct.save")}
      </button>
      <Saved text={message} />
    </form>
  );
}

function AddressesSection() {
  const t = useT();
  const [items, setItems] = useState<Address[] | null>(null);
  const [editing, setEditing] = useState<Address | "new" | null>(null);

  const load = useCallback(
    () =>
      accountApi.addresses().then(
        (r) => setItems(r.items),
        () => undefined,
      ),
    [],
  );
  useEffect(() => {
    load();
  }, [load]);

  return (
    <section className="panel">
      <h2 className="h3">{t("acct.addresses")}</h2>
      {items && items.length === 0 && !editing ? <p>{t("acct.noAddresses")}</p> : null}
      {items?.map((a) =>
        editing !== "new" && editing?.id === a.id ? null : (
          <div key={a.id} className="list-row">
            <strong>
              {a.name}
              {a.isDefault ? ` · ${t("acct.default")}` : ""}
            </strong>
            <span>
              {[a.line1, a.line2, `${a.postcode} ${a.city}`, t(`country.${a.country}`), a.phone]
                .filter(Boolean)
                .join(", ")}
            </span>
            <div className="row">
              <button type="button" className="btn btn--secondary btn--small" onClick={() => setEditing(a)}>
                {t("acct.edit")}
              </button>
              <button
                type="button"
                className="btn btn--secondary btn--small"
                onClick={() => accountApi.deleteAddress(a.id).then(load, () => undefined)}
              >
                {t("acct.delete")}
              </button>
            </div>
          </div>
        ),
      )}
      {editing ? (
        <AddressForm
          initial={editing === "new" ? EMPTY_ADDRESS : editing}
          onCancel={() => setEditing(null)}
          onSave={async (input) => {
            if (editing === "new") await accountApi.addAddress(input);
            else await accountApi.updateAddress(editing.id, input);
            setEditing(null);
            await load();
          }}
        />
      ) : (
        <button type="button" className="btn btn--secondary" onClick={() => setEditing("new")}>
          {t("acct.addAddress")}
        </button>
      )}
    </section>
  );
}

function AddressForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: AddressInput;
  onSave: (input: AddressInput) => Promise<void>;
  onCancel: () => void;
}) {
  const t = useT();
  const [form, setForm] = useState<AddressInput>({
    name: initial.name,
    line1: initial.line1,
    line2: initial.line2,
    city: initial.city,
    postcode: initial.postcode,
    country: initial.country,
    phone: initial.phone,
    isDefault: initial.isDefault,
  });
  const [error, setError] = useState<string | null>(null);
  const text = (key: "name" | "line1" | "city" | "postcode" | "phone", value: string) =>
    setForm({ ...form, [key]: value });

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await onSave({ ...form, line2: form.line2?.trim() ? form.line2 : null });
    } catch (e) {
      setError(t(statusOf(e) === 400 ? "required" : commonErrorKey(e)));
    }
  }

  return (
    <form onSubmit={submit}>
      <Field
        id="addr-name"
        label={t("acct.recipient")}
        autoComplete="name"
        required
        value={form.name}
        onChange={(e) => text("name", e.target.value)}
      />
      <Field
        id="addr-line1"
        label={t("acct.line1")}
        autoComplete="address-line1"
        required
        value={form.line1}
        onChange={(e) => text("line1", e.target.value)}
      />
      <Field
        id="addr-line2"
        label={t("acct.line2")}
        autoComplete="address-line2"
        value={form.line2 ?? ""}
        onChange={(e) => setForm({ ...form, line2: e.target.value })}
      />
      <Field
        id="addr-city"
        label={t("city")}
        autoComplete="address-level2"
        required
        value={form.city}
        onChange={(e) => text("city", e.target.value)}
      />
      <Field
        id="addr-postcode"
        label={t("acct.postcode")}
        autoComplete="postal-code"
        required
        minLength={3}
        maxLength={12}
        value={form.postcode}
        onChange={(e) => text("postcode", e.target.value)}
      />
      <div className="field">
        <label htmlFor="addr-country">{t("country")}</label>
        <select
          id="addr-country"
          value={form.country}
          onChange={(e) => setForm({ ...form, country: e.target.value as ShippingCountry })}
        >
          {COUNTRIES.map((c) => (
            <option key={c} value={c}>
              {t(`country.${c}`)}
            </option>
          ))}
        </select>
      </div>
      <Field
        id="addr-phone"
        label={t("acct.phone")}
        type="tel"
        autoComplete="tel"
        required
        value={form.phone}
        onChange={(e) => text("phone", e.target.value)}
      />
      <label className="check">
        <input
          type="checkbox"
          checked={form.isDefault}
          onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
        />
        {t("acct.makeDefault")}
      </label>
      {error ? (
        <p className="notice" role="alert">
          {error}
        </p>
      ) : null}
      <div className="row">
        <button type="submit" className="btn">
          {t("acct.save")}
        </button>
        <button type="button" className="btn btn--secondary" onClick={onCancel}>
          {t("acct.cancel")}
        </button>
      </div>
    </form>
  );
}

/** Orders still come from the demo checkout on this device until real checkout lands (M1 Task 6). */
function DemoOrders() {
  const t = useT();
  const locale = useLocale();
  const { state, hydrated } = useDemoStore();
  if (!hydrated) return null;
  return (
    <section className="panel">
      <h2 className="h3">{t("acct.demoOrders")}</h2>
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
    </section>
  );
}

function PrivacySection() {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function download() {
    const data = await accountApi.exportData();
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "kummie-my-data.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function close(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    try {
      await accountApi.deleteAccount(password);
      setMessage(t("acct.deleted"));
      setTimeout(() => router.push(href(locale, "/")), 4000);
    } catch (e) {
      setMessage(t(statusOf(e) === 401 ? "acct.wrongPassword" : commonErrorKey(e)));
    }
  }

  return (
    <section className="panel">
      <h2 className="h3">{t("acct.privacy")}</h2>
      <p className="muted">{t("acct.exportNote")}</p>
      <button type="button" className="btn btn--secondary" onClick={download}>
        {t("acct.export")}
      </button>
      <form onSubmit={close}>
        <h3 className="h3">{t("acct.deleteTitle")}</h3>
        <p className="muted">{t("acct.deleteNote")}</p>
        <Field
          id="delete-password"
          label={t("acct.deleteConfirm")}
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="submit" className="btn btn--secondary">
          {t("acct.deleteButton")}
        </button>
        {message ? (
          <p className="notice" role="status">
            {message}
          </p>
        ) : null}
      </form>
    </section>
  );
}
