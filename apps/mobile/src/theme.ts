import { colors, lineHeightPx, radius, sp, typeScale } from "@kummie/brand";
import type { TextStyle } from "react-native";

/**
 * Font family names as registered by `useFonts` in app/_layout.tsx. Android does not synthesise
 * weights for custom fonts, so each weight is its own family. Cyrillic falls back to the system
 * font per glyph until final Cyrillic fonts are chosen (D-003).
 */
export const fonts = {
  display: "ArchivoBlack",
  text: "SpaceGrotesk",
  textMedium: "SpaceGrotesk-Medium",
  textBold: "SpaceGrotesk-Bold",
  mono: "SpaceMono",
  monoBold: "SpaceMono-Bold",
} as const;

export type Scheme = "light" | "dark";

/** Light: Paper ground, Ink text, Violet active. Dark: Ink ground, Paper text, Glow active. */
export function palette(scheme: Scheme) {
  const dark = scheme === "dark";
  return {
    background: dark ? colors.ink : colors.paper,
    text: dark ? colors.paper : colors.ink,
    muted: dark ? colors.paper : colors.bodyMuted,
    card: dark ? colors.violet : colors.white,
    cardText: dark ? colors.white : colors.ink,
    border: dark ? colors.violet : colors.hairline,
    tabBar: dark ? colors.ink : colors.paper,
    tabActive: dark ? colors.glow : colors.violet,
    tabInactive: dark ? colors.paper : colors.label,
    header: colors.violet,
    headerText: colors.white,
  };
}

export const text = {
  h2: {
    fontFamily: fonts.display,
    fontSize: typeScale.h2.size,
    lineHeight: lineHeightPx(typeScale.h2),
  },
  body: {
    fontFamily: fonts.text,
    fontSize: typeScale.body.size,
    lineHeight: lineHeightPx(typeScale.body),
  },
  label: {
    fontFamily: fonts.monoBold,
    fontSize: typeScale.label.size,
    letterSpacing: typeScale.label.size * 0.12,
    textTransform: "uppercase",
  },
} satisfies Record<string, TextStyle>;

export { colors, radius, sp };
