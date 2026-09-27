import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { useNavigationContainerRef } from 'expo-router';
import { Stack } from 'expo-router/js-stack';
import * as SplashScreen from 'expo-splash-screen';
import * as Updates from 'expo-updates';
import { useEffect, useState } from 'react';
import { StyleSheet, Text as RNText, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AppSessionRoot } from '@/data/app-session/AppSessionRoot';
import {
  deviceAppState,
  reportAppSessionError,
  startDeviceAppSession,
} from '@/data/app-session/device-session';
import { BUNDLED_FONT_FAMILIES, useFontsReady } from '@/lib/fonts';
import { I18nRoot, useI18nReady } from '@/lib/i18n/I18nRoot';
import { useNavigationPersistence } from '@/lib/navigation/restore';
import { modalGroupOptions, pushTransition } from '@/lib/navigation/transitions';
import { ThemeProvider } from '@/lib/theme';
import { useMotionMode } from '@/motion/motion-mode';
import { IslandToast } from '@/motion/island-toast';
import { OverlayHost } from '@/motion/overlay/OverlayHost';
import { ScreenJoltProvider } from '@/motion/patterns/thud';
import { SharedGrowHost } from '@/ui/transitions/SharedGrow';
import { useTheme } from '@/ui';
import { RootErrorBoundary } from '@/ui/shell/RootErrorBoundary';

void SplashScreen.preventAutoHideAsync();

// Expo Router renders this in place of the root layout when anything below it throws.
export { RootErrorBoundary as ErrorBoundary };

/** Saved navigation is only restored into the same JS build it was saved from. */
const BUILD = `${Constants.expoConfig?.version ?? ''}:${Updates.updateId ?? 'embedded'}`;

/** Drill-down pushes by default; the `(modal)` group presents sheets and rises over the stack. */
function RootNavigator() {
  const { motion } = useTheme();
  const [motionMode] = useMotionMode();
  const navigationRef = useNavigationContainerRef();
  const [launchUrl, setLaunchUrl] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    Linking.getInitialURL()
      .then(setLaunchUrl)
      .catch(() => setLaunchUrl(null));
  }, []);
  useNavigationPersistence({ navigationRef, build: BUILD, launchUrl });
  return (
    <Stack screenOptions={pushTransition(motion, motionMode !== 'full')}>
      {/* eslint-disable-next-line lingui/no-unlocalized-strings -- a route group name, not copy */}
      <Stack.Screen name="(modal)" options={modalGroupOptions()} />
    </Stack>
  );
}

export default function RootLayout() {
  const theme = useTheme();
  const fontsReady = useFontsReady();
  const i18nReady = useI18nReady();
  const [prewarmed, setPrewarmed] = useState(false);

  // Render one hidden glyph per bundled face for a frame before revealing the app: this forces
  // the OS to rasterise each font's glyph atlas once up front, so the first *visible* text using
  // it doesn't stutter (design-system.md: fonts are prewarmed before the first hero paint).
  useEffect(() => {
    if (!fontsReady || !i18nReady) return undefined;
    const frame = requestAnimationFrame(() => setPrewarmed(true));
    return () => cancelAnimationFrame(frame);
  }, [fontsReady, i18nReady]);

  useEffect(() => {
    if (fontsReady && i18nReady && prewarmed) {
      void SplashScreen.hideAsync();
    }
  }, [fontsReady, i18nReady, prewarmed]);

  // Gated on both: I18nRoot's own I18nProvider would otherwise render nothing until a locale is
  // active, which would swap the splash screen for a blank frame instead of keeping it up.
  if (!fontsReady || !i18nReady) return null;

  // Provider order: gestures (one root for every GestureDetector) → locale → theme (contrast, font
  // scale) → session (local-first database, realtime) → screen jolt → navigation, with the overlay, shared-grow and toast hosts above screens.
  return (
    <GestureHandlerRootView style={[styles.root, { backgroundColor: theme.color.ink['950'] }]}>
      <I18nRoot>
        {prewarmed ? null : (
          <View pointerEvents="none" style={styles.prewarm}>
            {BUNDLED_FONT_FAMILIES.map((family) => (
              <RNText key={family} style={{ fontFamily: family }}>
                Aa
              </RNText>
            ))}
          </View>
        )}
        <ThemeProvider>
          <AppSessionRoot
            start={startDeviceAppSession}
            appState={deviceAppState}
            onError={reportAppSessionError}
          >
            <ScreenJoltProvider>
              <RootNavigator />
              <OverlayHost />
              <SharedGrowHost />
              <IslandToast />
            </ScreenJoltProvider>
          </AppSessionRoot>
        </ThemeProvider>
      </I18nRoot>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  prewarm: {
    position: 'absolute',
    opacity: 0,
  },
});
