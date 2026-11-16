import { NextResponse, type NextRequest } from "next/server";

const LOCALES = ["bg", "en"] as const;
const DEFAULT_LOCALE = "bg";

/**
 * Every page lives under /bg/… or /en/…. Anything else (including "/" and "/dev/typography")
 * is redirected to the Bulgarian default.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasLocale = LOCALES.some((locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`));
  if (hasLocale) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = `/${DEFAULT_LOCALE}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Skip Next internals, API routes and files with an extension (icons, manifest, fonts).
  matcher: ["/((?!_next/|api/|.*\\..*).*)"],
};
