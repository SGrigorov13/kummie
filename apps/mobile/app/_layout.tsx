import { ArchivoBlack_400Regular } from "@expo-google-fonts/archivo-black";
import { JetBrainsMono_400Regular, JetBrainsMono_700Bold } from "@expo-google-fonts/jetbrains-mono";
import { Montserrat_900Black } from "@expo-google-fonts/montserrat";
import { Onest_400Regular, Onest_500Medium, Onest_700Bold } from "@expo-google-fonts/onest";
import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_700Bold,
} from "@expo-google-fonts/space-grotesk";
import { SpaceMono_400Regular, SpaceMono_700Bold } from "@expo-google-fonts/space-mono";
import { useFonts } from "expo-font";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { useColorScheme } from "react-native";
import { useLocale } from "@/components/locale";
import { FONT_FAMILIES, fontsFor, palette } from "@/theme";

export { ErrorBoundary } from "expo-router";

export const unstable_settings = {
  anchor: "(tabs)",
};

SplashScreen.preventAutoHideAsync();

const { latin, cyrillic } = FONT_FAMILIES;

/** Brand fonts for Latin, chosen companions for Cyrillic (D-003). All SIL OFL. */
const FONT_MAP = {
  [latin.display]: ArchivoBlack_400Regular,
  [latin.text]: SpaceGrotesk_400Regular,
  [latin.textMedium]: SpaceGrotesk_500Medium,
  [latin.textBold]: SpaceGrotesk_700Bold,
  [latin.mono]: SpaceMono_400Regular,
  [latin.monoBold]: SpaceMono_700Bold,
  [cyrillic.display]: Montserrat_900Black,
  [cyrillic.text]: Onest_400Regular,
  [cyrillic.textMedium]: Onest_500Medium,
  [cyrillic.textBold]: Onest_700Bold,
  [cyrillic.mono]: JetBrainsMono_400Regular,
  [cyrillic.monoBold]: JetBrainsMono_700Bold,
};

export default function RootLayout() {
  const [loaded, error] = useFonts(FONT_MAP);

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  if (!loaded) return null;
  return <RootNavigator />;
}

function RootNavigator() {
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  const colors = palette(scheme);
  const fonts = fontsFor(useLocale());
  const base = scheme === "dark" ? DarkTheme : DefaultTheme;
  const theme = {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.tabActive,
      background: colors.background,
      card: colors.tabBar,
      text: colors.text,
      border: colors.border,
    },
  };
  return (
    <ThemeProvider value={theme}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.header },
          headerTintColor: colors.headerText,
          headerTitleStyle: { fontFamily: fonts.textBold },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="product/[id]" />
      </Stack>
    </ThemeProvider>
  );
}
