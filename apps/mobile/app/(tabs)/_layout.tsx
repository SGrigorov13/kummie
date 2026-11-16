import { t, type MessageKey } from "@kummie/i18n";
import { Tabs } from "expo-router";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { useColorScheme, type ColorValue } from "react-native";
import { useLocale } from "@/components/locale";
import { fontsFor, palette } from "@/theme";

type TabDef = {
  name: string;
  title: MessageKey;
  icon: SymbolViewProps["name"];
};

/** Five tabs per brand spec: Home · Shop · Collection · Drops · Chingu (Ask KUMMIE). */
const TABS: readonly TabDef[] = [
  { name: "index", title: "mobile.home", icon: { ios: "house", android: "home", web: "home" } },
  { name: "shop", title: "mobile.shop", icon: { ios: "bag", android: "shopping_bag", web: "shopping_bag" } },
  {
    name: "collection",
    title: "mobile.collection",
    icon: { ios: "rectangle.stack", android: "collections_bookmark", web: "collections_bookmark" },
  },
  { name: "drops", title: "mobile.drops", icon: { ios: "bolt", android: "bolt", web: "bolt" } },
  {
    name: "chingu",
    title: "mobile.chingu",
    icon: { ios: "bubble.left", android: "chat_bubble", web: "chat_bubble" },
  },
];

function tabIcon(name: SymbolViewProps["name"]) {
  return function TabIcon({ color }: { color: ColorValue }) {
    return <SymbolView name={name} tintColor={color} size={24} />;
  };
}

export default function TabLayout() {
  const locale = useLocale();
  const colors = palette(useColorScheme() === "dark" ? "dark" : "light");
  const fonts = fontsFor(locale);
  return (
    <Tabs
      screenOptions={{
        // Tab bar: Paper (light) / Ink (dark); active icon Violet (light) / Glow (dark).
        tabBarActiveTintColor: colors.tabActive,
        tabBarInactiveTintColor: colors.tabInactive,
        tabBarStyle: { backgroundColor: colors.tabBar, borderTopColor: colors.border, minHeight: 56 },
        tabBarLabelStyle: { fontFamily: fonts.textMedium, fontSize: 12 },
        // App chrome is the violet brand ground with white titles.
        headerStyle: { backgroundColor: colors.header },
        headerTintColor: colors.headerText,
        headerTitleStyle: { fontFamily: fonts.display, fontSize: 20 },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: t(locale, tab.title),
            headerTitle: tab.name === "index" ? "KUMMIE" : t(locale, tab.title),
            tabBarIcon: tabIcon(tab.icon),
          }}
        />
      ))}
    </Tabs>
  );
}
