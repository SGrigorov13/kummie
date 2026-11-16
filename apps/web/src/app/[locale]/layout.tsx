import "@kummie/brand/tokens.css";
import "@kummie/brand/fonts.css";
import "@kummie/brand/brand.css";
import "../globals.css";

import { colors } from "@kummie/brand";
import { t } from "@kummie/i18n";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { CookieBanner } from "@/components/CookieBanner";
import { Footer } from "@/components/Footer";
import { DemoStoreProvider } from "@/lib/demo-store";
import { LocaleProvider } from "@/lib/locale";
import { localeParam, staticLocales } from "@/lib/paths";
import { promoBootScript } from "@/lib/promo";

type Props = { children: ReactNode; params: Promise<{ locale: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return staticLocales();
}

export async function generateMetadata({ params }: Omit<Props, "children">): Promise<Metadata> {
  const locale = localeParam((await params).locale);
  return {
    title: { default: "KUMMIE — Your K-pop Chingu", template: "%s · KUMMIE" },
    description: t(locale, "heroBody"),
    alternates: { languages: { bg: "/bg", en: "/en" } },
  };
}

export const viewport: Viewport = {
  themeColor: colors.violet,
  width: "device-width",
  initialScale: 1,
};

export default async function LocaleLayout({ children, params }: Props) {
  const locale = localeParam((await params).locale);
  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        {/* Essential UI preference only (dismissed promo bar), applied before paint to avoid layout shift. */}
        <script dangerouslySetInnerHTML={{ __html: promoBootScript }} />
      </head>
      <body>
        <LocaleProvider locale={locale}>
          <DemoStoreProvider>
            <a className="skip-link" href="#main">
              {t(locale, "skipToContent")}
            </a>
            {children}
            <Footer locale={locale} />
            <CookieBanner />
          </DemoStoreProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
