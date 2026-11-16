import { t, type MessageKey } from "@kummie/i18n";
import { ScrollView, Text, useColorScheme, View } from "react-native";
import { palette, radius, sp, text } from "@/theme";
import { Equaliser } from "./Equaliser";
import { useLocale } from "./locale";

/** Branded placeholder used by every tab until M5 builds the real screens. */
export function PlaceholderScreen({ title, lead }: { title: MessageKey; lead?: MessageKey }) {
  const locale = useLocale();
  const colors = palette(useColorScheme() === "dark" ? "dark" : "light");
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: sp(6), gap: sp(4) }}
    >
      <Text accessibilityRole="header" style={[text.h2, { color: colors.text }]}>
        {t(locale, title)}
      </Text>
      {lead ? <Text style={[text.body, { color: colors.text }]}>{t(locale, lead)}</Text> : null}
      <View
        style={{
          padding: sp(6),
          gap: sp(4),
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
        }}
      >
        <Equaliser />
        <Text style={[text.body, { color: colors.cardText }]}>{t(locale, "mobile.placeholder")}</Text>
      </View>
    </ScrollView>
  );
}
