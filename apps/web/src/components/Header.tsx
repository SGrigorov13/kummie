import { LogoLockup } from "@kummie/brand/react";
import { t, type Locale } from "@kummie/i18n";
import Link from "next/link";
import { href } from "@/lib/paths";
import { HeaderTools, MainNav, SearchForm } from "./HeaderClient";

/** Violet header: logo, always-visible search, tools, and Shop · Collect · Magazine · Teen · Club. */
export function Header({ locale }: { locale: Locale }) {
  return (
    <header className="site-header on-violet">
      <div className="wrap header-row">
        <Link href={href(locale)} className="logo-link" aria-label={t(locale, "homeLink")}>
          <LogoLockup size={26} />
        </Link>
        <SearchForm />
        <HeaderTools />
      </div>
      <div className="wrap">
        <MainNav />
      </div>
    </header>
  );
}
