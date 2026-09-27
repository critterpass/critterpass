import { useLingui } from '@lingui/react/macro';
import type { ErrorBoundaryProps } from 'expo-router';
import { router } from 'expo-router';
import { Stack } from 'expo-router/js-stack';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text as RNText, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { BUNDLED_FONT_FAMILIES, useFontsReady } from '@/lib/fonts';
import { I18nRoot, useI18nReady } from '@/lib/i18n/I18nRoot';
import { modalGroupOptions, pushTransition } from '@/lib/navigation/transitions';
import { ThemeProvider } from '@/lib/theme';
import { useMotionMode } from '@/motion/motion-mode';
import { IslandToast } from '@/motion/island-toast';
import { OverlayHost } from '@/motion/overlay/OverlayHost';
import { ScreenJoltProvider } from '@/motion/patterns/thud';
import {
  makeStyles,
  MIN_TOUCH_TARGET,
  Row,
  Scaffold,
  sizeToken,
  Stack as Column,
  Text,
  useTheme,
} from '@/ui';

void SplashScreen.preventAutoHideAsync();

/** Drill-down pushes by default; the `(modal)` group presents sheets and rises over the stack. */
function RootNavigator() {
  const { motion } = useTheme();
  const [motionMode] = useMotionMode();
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
  // scale) → screen jolt → navigation, with the overlay, shared-grow and toast hosts above screens.
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
          <ScreenJoltProvider>
            <RootNavigator />
            <OverlayHost />
            <IslandToast />
          </ScreenJoltProvider>
        </ThemeProvider>
      </I18nRoot>
    </GestureHandlerRootView>
  );
}

const HOME_HREF = '/';

const useErrorStyles = makeStyles((t) => ({
  panel: {
    marginTop: 'auto',
    backgroundColor: t.semantic.bg.raised,
    borderTopStartRadius: t.radius.sheetTop,
    borderTopEndRadius: t.radius.sheetTop,
    padding: t.size.gutter,
    paddingBottom: t.size.cta.bottom,
    gap: t.space['16'],
  },
  option: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: t.radius.lg,
    backgroundColor: t.semantic.bg.control,
    padding: t.space['14'],
    gap: t.space['4'],
  },
  primary: {
    minHeight: sizeToken(t.size.primaryCta, 'height'),
    borderRadius: sizeToken(t.size.primaryCta, 'radius'),
    backgroundColor: t.semantic.action.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: t.space['20'],
  },
}));

/**
 * Root error boundary (undesigned; follows the 3i-4 "three ways forward" pattern): try again,
 * go back, or go home. Never shows the raw error. Wraps every route below the root layout.
 */
export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  const { t } = useLingui();
  const styles = useErrorStyles();
  const theme = useTheme();
  const canGoBack = router.canGoBack();
  const options = [
    ...(canGoBack
      ? [
          {
            key: 'back',
            title: t({ id: 'common.shell.errorBack', message: 'Go back' }),
            body: t({ id: 'common.shell.errorBackBody', message: 'Pick up where you were' }),
            onPress: () => router.back(),
          },
        ]
      : []),
    {
      key: 'home',
      title: t({ id: 'common.shell.errorHome', message: 'Go home' }),
      body: t({ id: 'common.shell.errorHomeBody', message: 'Start again from your crews' }),
      onPress: () => router.replace(HOME_HREF),
    },
  ];

  return (
    <Scaffold edges={['top']}>
      <View style={styles.panel} testID="shell-error">
        <Text variant="eyebrow">
          {t({ id: 'common.shell.errorEyebrow', message: 'Something went sideways' })}
        </Text>
        <Text variant="h2" accessibilityRole="header">
          {t({ id: 'common.shell.errorTitle', message: 'That didn’t load' })}
        </Text>
        <Row gap="8" align="stretch">
          {options.map((option) => (
            <Pressable
              key={option.key}
              testID={`shell-error-${option.key}`}
              accessibilityRole="button"
              onPress={option.onPress}
              style={styles.option}
            >
              <Column gap="4">
                <Text variant="title">{option.title}</Text>
                <Text variant="bodySm">{option.body}</Text>
              </Column>
            </Pressable>
          ))}
        </Row>
        <Pressable
          testID="shell-error-retry"
          accessibilityRole="button"
          onPress={() => void retry()}
          style={styles.primary}
        >
          <Text variant="buttonLg" color={theme.semantic.text.onAccent}>
            {t({ id: 'common.shell.errorRetry', message: 'Try again' })}
          </Text>
        </Pressable>
      </View>
    </Scaffold>
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
