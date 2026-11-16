import { t } from "@kummie/i18n";
import { Link, Stack } from "expo-router";
import { Text, useColorScheme, View } from "react-native";
import { useLocale } from "@/components/locale";
import { palette, sp, text } from "@/theme";

export default function NotFoundScreen() {
  const locale = useLocale();
  const colors = palette(useColorScheme() === "dark" ? "dark" : "light");
  return (
    <>
      <Stack.Screen options={{ title: "404" }} />
      <View
        style={{
          flex: 1,
          gap: sp(4),
          padding: sp(6),
          justifyContent: "center",
          backgroundColor: colors.background,
        }}
      >
        <Text style={[text.h2, { color: colors.text }]}>{t(locale, "notFound")}</Text>
        <Link href="/" style={[text.body, { color: colors.tabActive }]}>
          {t(locale, "mobile.home")}
        </Link>
      </View>
    </>
  );
}
