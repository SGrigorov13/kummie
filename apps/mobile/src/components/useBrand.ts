import { translator } from "@kummie/i18n";
import { useMemo } from "react";
import { useColorScheme } from "react-native";
import { fontsFor, palette, textStyles } from "@/theme";
import { useLocale } from "./locale";

/** Everything a screen needs: language, translator, colours for the scheme and type styles. */
export function useBrand() {
  const locale = useLocale();
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  return useMemo(
    () => ({
      locale,
      t: translator(locale),
      colors: palette(scheme),
      type: textStyles(locale),
      fonts: fontsFor(locale),
    }),
    [locale, scheme],
  );
}
