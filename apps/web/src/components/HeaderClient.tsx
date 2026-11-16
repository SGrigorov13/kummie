"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useCart } from "@/lib/shop";
import { useLocale, useT } from "@/lib/locale";
import { href, switchLocale } from "@/lib/paths";

export function SearchForm() {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [query, setQuery] = useState("");

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const q = query.trim();
    router.push(href(locale, q ? `/shop?q=${encodeURIComponent(q)}` : "/shop"));
  }

  return (
    <form className="search" role="search" onSubmit={onSubmit}>
      <label className="sr-only" htmlFor="site-search">
        {t("search")}
      </label>
      <input
        id="site-search"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t("searchPh")}
        autoComplete="off"
      />
      <button type="submit" className="search__submit">
        {t("searchSubmit")}
      </button>
    </form>
  );
}

export function HeaderTools() {
  const t = useT();
  const locale = useLocale();
  const pathname = usePathname();
  const { count: cartCount } = useCart();
  const other = locale === "bg" ? "en" : "bg";
  return (
    <div className="header-tools">
      <Link href={switchLocale(pathname, other)} hrefLang={other} lang={other} className="header-link">
        {t("langSwitch")}
      </Link>
      <Link href={href(locale, "/account")} className="header-link">
        {t("account")}
      </Link>
      <Link
        href={href(locale, "/cart")}
        className="header-link cart-link"
        aria-label={t("cartCount", { count: cartCount })}
      >
        {t("cart")}
        <span className="cart-link__count" aria-hidden="true">
          {cartCount}
        </span>
      </Link>
    </div>
  );
}

const NAV = ["shop", "collect", "magazine", "teen", "club"] as const;

export function MainNav() {
  const t = useT();
  const locale = useLocale();
  const pathname = usePathname();
  return (
    <nav className="main-nav" aria-label={t("mainNav")}>
      <ul>
        {NAV.map((item) => {
          const target = href(locale, `/${item}`);
          const active = pathname === target || pathname.startsWith(`${target}/`);
          return (
            <li key={item}>
              <Link href={target} aria-current={active ? "page" : undefined}>
                {t(item)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
