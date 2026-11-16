import { DEFAULT_LOCALE, type Locale } from "@kummie/i18n";

/**
 * Bulgarian by default. Device-locale detection and an in-app switch arrive with the real screens
 * in M5; keeping this as a hook means callers will not change.
 */
export function useLocale(): Locale {
  return DEFAULT_LOCALE;
}
