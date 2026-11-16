import type { bg } from "./bg";

export type Locale = "bg" | "en";

/** Every message key. The Bulgarian file defines the set. */
export type MessageKey = keyof typeof bg;

export type Messages = { readonly [K in MessageKey]: string };
