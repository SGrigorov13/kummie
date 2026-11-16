import { ArchivoBlack_400Regular } from "@expo-google-fonts/archivo-black";
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
import { fonts, palette } from "@/theme";

export { ErrorBoundary } from "expo-router";

export const unstable_settings = {
  anchor: "(tabs)",
};

SplashScreen.preventAutoHideAsync();

/** Brand fonts (OFL). Cyrillic falls back to the system font per glyph (D-003). */
const FONT_MAP = {
  [fonts.display]: ArchivoBlack_400Regular,
  [fonts.text]: SpaceGrotesk_400Regular,
  [fonts.textMedium]: SpaceGrotesk_500Medium,
  [fonts.textBold]: SpaceGrotesk_700Bold,
  [fonts.mono]: SpaceMono_400Regular,
  [fonts.monoBold]: SpaceMono_700Bold,
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
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </ThemeProvider>
  );
}
