import { LogoLockup } from "@kummie/brand/react";
import type { Staff } from "@kummie/contracts";
import { translator, type Locale, type MessageKey } from "@kummie/i18n";
import { useEffect, useMemo, useState } from "react";
import { Catalogue, useProductStats } from "./Catalogue";
import { CompanySettings } from "./CompanySettings";
import { AdminProvider, api, useAdmin } from "./context";
import { ProductEditor } from "./ProductEditor";
import { SignIn } from "./SignIn";

type Section = "dashboard" | "catalog" | "company" | "orders" | "batches" | "hub";

const NAV: { id: Section; label: MessageKey; roles?: Staff["role"][] }[] = [
  { id: "dashboard", label: "admin.dashboard" },
  { id: "catalog", label: "admin.catalog", roles: ["admin", "content"] },
  { id: "orders", label: "admin.orders" },
  { id: "batches", label: "admin.batches" },
  { id: "hub", label: "admin.hub" },
  { id: "company", label: "admin.company", roles: ["admin"] },
];

/**
 * KUMMIE admin: staff sign-in with mandatory 2FA, then the dashboard, catalogue editor and company
 * settings. Orders, batches and the hub arrive in later parts of M1/M2.
 */
export function App() {
  const [locale, setLocale] = useState<Locale>("bg");
  const [staff, setStaff] = useState<Staff | null | undefined>(undefined);
  const t = useMemo(() => translator(locale), [locale]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    api.me().then(setStaff, () => setStaff(null));
  }, []);

  const langButton = (
    <button type="button" className="link-button" onClick={() => setLocale(locale === "bg" ? "en" : "bg")}>
      {t("langSwitch")}
    </button>
  );

  if (staff === undefined) return <p className="loading">{t("admin.loading")}</p>;

  if (staff === null) {
    return (
      <main className="signin">
        <div className="signin__brand">
          <LogoLockup size={40} />
        </div>
        <SignIn t={t} onSignedIn={setStaff} />
        <div className="signin__lang">{langButton}</div>
      </main>
    );
  }

  return (
    <AdminProvider value={{ locale, t, staff }}>
      <Shell langButton={langButton} onSignOut={() => api.logout().finally(() => setStaff(null))} />
    </AdminProvider>
  );
}

function Shell({ langButton, onSignOut }: { langButton: React.ReactNode; onSignOut: () => void }) {
  const { t, staff } = useAdmin();
  const [section, setSection] = useState<Section>("dashboard");
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const visible = NAV.filter((n) => !n.roles || n.roles.includes(staff.role));
  const current = NAV.find((n) => n.id === section) ?? NAV[0];

  return (
    <div className="shell">
      <aside className="sidebar">
        <LogoLockup size={22} tagline={false} />
        <nav aria-label={t("admin.title")}>
          <ul>
            {visible.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  aria-current={section === n.id ? "page" : undefined}
                  onClick={() => {
                    setSection(n.id);
                    setEditing(null);
                  }}
                >
                  {t(n.label)}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <p className="sidebar__who">{t("admin.signedInAs", { name: staff.name })}</p>
      </aside>
      <main className="content">
        <header className="content__header">
          <h1>
            {editing
              ? editing === "new"
                ? t("admin.newProduct")
                : t("admin.catalog")
              : t(current?.label ?? "admin.dashboard")}
          </h1>
          <div className="content__tools">
            {langButton}
            <button type="button" className="btn btn--secondary" onClick={onSignOut}>
              {t("admin.signOut")}
            </button>
          </div>
        </header>
        {section === "dashboard" ? <Dashboard /> : null}
        {section === "catalog" && !editing ? <Catalogue onOpen={setEditing} /> : null}
        {section === "catalog" && editing ? (
          <ProductEditor id={editing} onClose={() => setEditing(null)} onCreated={setEditing} />
        ) : null}
        {section === "company" ? <CompanySettings /> : null}
        {["orders", "batches", "hub"].includes(section) ? (
          <section className="empty">
            <p>{t("admin.comingLater")}</p>
          </section>
        ) : null}
      </main>
    </div>
  );
}

function Dashboard() {
  const { t, staff } = useAdmin();
  const stats = useProductStats();
  if (staff.role === "hub")
    return (
      <section className="empty">
        <p>{t("admin.comingLater")}</p>
      </section>
    );
  return (
    <div className="stats">
      {(
        [
          ["admin.stats.published", stats?.published],
          ["admin.stats.drafts", stats?.drafts],
          ["admin.stats.blocked", stats?.blocked],
        ] as const
      ).map(([label, value]) => (
        <div className="stat" key={label}>
          <span className="stat__value">{value ?? "…"}</span>
          <span className="stat__label">{t(label)}</span>
        </div>
      ))}
    </div>
  );
}
