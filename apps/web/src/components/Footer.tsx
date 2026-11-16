import { t, type Locale } from "@kummie/i18n";
import Link from "next/link";
import { href } from "@/lib/paths";

export const LEGAL_PAGES = ["withdrawal", "returns", "guarantee", "privacy", "terms", "complaints"] as const;
export type LegalPage = (typeof LEGAL_PAGES)[number];

/**
 * Rendered on every page, Teen included: withdrawal, returns, guarantee, privacy, terms, complaints,
 * trader data and payment & delivery (ЗЗП).
 */
export function Footer({ locale }: { locale: Locale }) {
  return (
    <footer className="site-footer on-ink">
      <div className="wrap footer-grid">
        <div>
          <p className="footer-word">KUMMIE</p>
          <p>{t(locale, "footerTagline")}</p>
          <p className="footer-note">{t(locale, "rights")}</p>
        </div>
        <nav aria-label={t(locale, "footerLegal")}>
          <ul className="footer-links">
            {LEGAL_PAGES.map((page) => (
              <li key={page}>
                <Link href={href(locale, `/legal/${page}`)}>{t(locale, page)}</Link>
              </li>
            ))}
            <li>
              <Link href={href(locale, "/legal/trader")}>{t(locale, "trader")}</Link>
            </li>
            <li>
              <Link href={href(locale, "/legal/delivery")}>{t(locale, "deliveryPage")}</Link>
            </li>
          </ul>
        </nav>
        <nav aria-label={t(locale, "explore")}>
          <ul className="footer-links">
            <li>
              <Link href={href(locale, "/groups")}>{t(locale, "groups")}</Link>
            </li>
            <li>
              <Link href={href(locale, "/calendar")}>{t(locale, "calendar")}</Link>
            </li>
            <li>
              <Link href={href(locale, "/ask")}>{t(locale, "chingu")}</Link>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
