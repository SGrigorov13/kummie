import { colors, lineHeightPx, radius, sp, typeScale } from "@kummie/brand";
import type { Locale } from "@kummie/i18n";
import type { TextStyle } from "react-native";

/**
 * Font family names as registered by `useFonts` in app/_layout.tsx. Android does not synthesise
 * weights for custom fonts, so each weight is its own family.
 *
 * React Native cannot fall back from one custom font to another per glyph, so the family follows the
 * language (D-003): Latin brand fonts for English, the chosen Cyrillic companions for Bulgarian —
 * Montserrat Black (display), Onest (text), JetBrains Mono (labels).
 */
const LATIN = {
  display: "ArchivoBlack",
  text: "SpaceGrotesk",
  textMedium: "SpaceGrotesk-Medium",
  textBold: "SpaceGrotesk-Bold",
  mono: "SpaceMono",
  monoBold: "SpaceMono-Bold",
} as const;

const CYRILLIC = {
  display: "Montserrat-Black",
  text: "Onest",
  textMedium: "Onest-Medium",
  textBold: "Onest-Bold",
  mono: "JetBrainsMono",
  monoBold: "JetBrainsMono-Bold",
} as const;

export type FontSet = { [K in keyof typeof LATIN]: string };

export function fontsFor(locale: Locale): FontSet {
  return locale === "bg" ? CYRILLIC : LATIN;
}

/** Every family the app registers (used by the font loader). */
export const FONT_FAMILIES = { latin: LATIN, cyrillic: CYRILLIC };

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

export type Palette = ReturnType<typeof palette>;

/** Brand type styles for a language. */
export function textStyles(locale: Locale) {
  const f = fontsFor(locale);
  return {
    display: {
      fontFamily: f.display,
      fontSize: 32,
      lineHeight: 36,
    },
    h2: {
      fontFamily: f.display,
      fontSize: typeScale.h2.size - 6,
      lineHeight: lineHeightPx(typeScale.h2) - 6,
    },
    h3: {
      fontFamily: f.textBold,
      fontSize: typeScale.h3.size,
      lineHeight: lineHeightPx(typeScale.h3),
    },
    body: {
      fontFamily: f.text,
      fontSize: typeScale.body.size,
      lineHeight: lineHeightPx(typeScale.body),
    },
    small: {
      fontFamily: f.text,
      fontSize: typeScale.small.size,
      lineHeight: lineHeightPx(typeScale.small),
    },
    strong: {
      fontFamily: f.textBold,
      fontSize: typeScale.body.size,
      lineHeight: lineHeightPx(typeScale.body),
    },
    label: {
      fontFamily: f.monoBold,
      fontSize: typeScale.label.size,
      letterSpacing: typeScale.label.size * 0.12,
      textTransform: "uppercase",
    },
  } satisfies Record<string, TextStyle>;
}

export type TextStyles = ReturnType<typeof textStyles>;

export { colors, radius, sp };
