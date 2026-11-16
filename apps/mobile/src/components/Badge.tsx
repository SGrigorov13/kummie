import { badgeSpec, type Locale, type ProductState, type Sourcing } from "@kummie/core";
import { Text, View } from "react-native";
import { fontsFor } from "@/theme";

/** Enum-driven badge (docs/brand/badges.json) — no free-text badges. */
export function Badge({ id, locale }: { id: Sourcing | ProductState; locale: Locale }) {
  const spec = badgeSpec(id);
  const borderColor = spec.border ? spec.border.split(" ").at(-1) : spec.fill;
  return (
    <View
      style={{
        alignSelf: "flex-start",
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 6,
        borderWidth: 2,
        borderColor,
        backgroundColor: spec.fill,
      }}
    >
      <Text
        style={{
          color: spec.text,
          fontFamily: fontsFor(locale).monoBold,
          fontSize: 11,
          letterSpacing: 1.2,
          textTransform: "uppercase",
        }}
      >
        {spec[locale]}
      </Text>
    </View>
  );
}
