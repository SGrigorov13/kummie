import { colors, equaliser } from "@kummie/brand";
import { View } from "react-native";

/**
 * Static six-bar equaliser (logo-geometry.md §2). The animated version (loading, live drops,
 * Ask KUMMIE thinking) comes with M5 and must honour reduced motion.
 */
export function Equaliser({ height = 32 }: { height?: number }) {
  const width = height / equaliser.widthDivisor;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ flexDirection: "row", alignItems: "center", height, gap: height / equaliser.gapDivisor }}
    >
      {equaliser.bars.map((ratio, index) => (
        <View
          key={index}
          style={{
            width,
            height: height * ratio,
            borderRadius: width / equaliser.radiusDivisor,
            backgroundColor: (equaliser.glowBars as readonly number[]).includes(index)
              ? colors.glow
              : colors.pink,
          }}
        />
      ))}
    </View>
  );
}
