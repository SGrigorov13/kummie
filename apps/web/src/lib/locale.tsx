"use client";

import { translator, type Locale, type Translate } from "@kummie/i18n";
import { createContext, useContext, useMemo, type ReactNode } from "react";

const LocaleContext = createContext<Locale>("bg");

export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

export function useT(): Translate {
  const locale = useLocale();
  return useMemo(() => translator(locale), [locale]);
}
