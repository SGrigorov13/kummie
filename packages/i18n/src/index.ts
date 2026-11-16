import { bg } from "./bg";
import { en } from "./en";
import type { Locale, MessageKey, Messages } from "./types";

export type { Locale, MessageKey, Messages } from "./types";

/** Bulgarian is the default locale; English is second. */
export const DEFAULT_LOCALE: Locale = "bg";
export const LOCALES: readonly Locale[] = ["bg", "en"];

export const messages: Readonly<Record<Locale, Messages>> = { bg, en };

/** Fills `{name}` placeholders. Unknown placeholders are left as they are. */
export function format(template: string, values: Readonly<Record<string, string | number>> = {}): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in values ? String(values[name]) : whole,
  );
}

/** Translates a key, optionally filling placeholders. */
export function t(
  locale: Locale,
  key: MessageKey,
  values?: Readonly<Record<string, string | number>>,
): string {
  const message = messages[locale][key];
  return values ? format(message, values) : message;
}

/** A translator bound to one locale. */
export function translator(locale: Locale) {
  return (key: MessageKey, values?: Readonly<Record<string, string | number>>) => t(locale, key, values);
}

export type Translate = ReturnType<typeof translator>;
