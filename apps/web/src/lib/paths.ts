import { isLocale, type Locale } from "@kummie/core";
import { notFound } from "next/navigation";

/** Builds a locale-prefixed path: `href("bg", "/shop")` → "/bg/shop". */
export function href(locale: Locale, path = ""): string {
  return `/${locale}${path === "/" ? "" : path}`;
}

/** Swaps the locale segment of a pathname. */
export function switchLocale(pathname: string, to: Locale): string {
  const rest = pathname.replace(/^\/(bg|en)(?=\/|$)/, "");
  return href(to, rest || "");
}

/** Narrows a route param to a supported locale, or renders the 404 page. */
export function localeParam(value: string): Locale {
  if (!isLocale(value)) notFound();
  return value;
}

export function staticLocales(): { locale: Locale }[] {
  return [{ locale: "bg" }, { locale: "en" }];
}
