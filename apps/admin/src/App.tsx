import { LogoLockup } from "@kummie/brand/react";
import { translator, type Locale, type MessageKey } from "@kummie/i18n";
import { useEffect, useMemo, useState, type FormEvent } from "react";

type View = "signIn" | "dashboard";

const SECTIONS: MessageKey[] = ["admin.dashboard", "admin.orders", "admin.batches", "admin.hub", "admin.catalog"];

/**
 * M0 admin shell: a sign-in placeholder and an empty dashboard. Nothing is sent anywhere — real
 * staff auth (roles admin/hub/content, 2FA) arrives with the API in M1.
 */
export function App() {
  const [locale, setLocale] = useState<Locale>("bg");
  const [view, setView] = useState<View>("signIn");
  const [section, setSection] = useState<MessageKey>("admin.dashboard");
  const t = useMemo(() => translator(locale), [locale]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const langButton = (
    <button type="button" className="link-button" onClick={() => setLocale(locale === "bg" ? "en" : "bg")}>
      {t("langSwitch")}
    </button>
  );

  if (view === "signIn") {
    const onSubmit = (event: FormEvent) => {
      event.preventDefault();
      setView("dashboard");
    };
    return (
      <main className="signin">
        <div className="signin__brand">
          <LogoLockup size={40} />
        </div>
        <form className="signin__card" onSubmit={onSubmit}>
          <h1>{t("admin.signIn")}</h1>
          <p className="note">{t("admin.signInNote")}</p>
          <label htmlFor="email">{t("admin.email")}</label>
          <input id="email" type="email" autoComplete="off" />
          <label htmlFor="password">{t("admin.password")}</label>
          <input id="password" type="password" autoComplete="off" />
          <button type="submit" className="btn">
            {t("admin.signIn")}
          </button>
          <div className="signin__lang">{langButton}</div>
        </form>
      </main>
    );
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <LogoLockup size={22} tagline={false} />
        <nav aria-label={t("admin.title")}>
          <ul>
            {SECTIONS.map((key) => (
              <li key={key}>
                <button
                  type="button"
                  aria-current={section === key ? "page" : undefined}
                  onClick={() => setSection(key)}
                >
                  {t(key)}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      <main className="content">
        <header className="content__header">
          <h1>{t(section)}</h1>
          <div className="content__tools">
            {langButton}
            <button type="button" className="btn btn--secondary" onClick={() => setView("signIn")}>
              {t("admin.signOut")}
            </button>
          </div>
        </header>
        <section className="empty">
          <p className="label">{t("admin.title")}</p>
          <p>{t("admin.empty")}</p>
        </section>
      </main>
    </div>
  );
}
