import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BUNDLED_FONT_FAMILIES, useFontsReady } from '@/lib/fonts';
import { I18nRoot, useI18nReady } from '@/lib/i18n/I18nRoot';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
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

  return (
    <I18nRoot>
      {prewarmed ? null : (
        <View pointerEvents="none" style={styles.prewarm}>
          {BUNDLED_FONT_FAMILIES.map((family) => (
            <Text key={family} style={{ fontFamily: family }}>
              Aa
            </Text>
          ))}
        </View>
      )}
      <Stack screenOptions={{ headerShown: false }} />
    </I18nRoot>
  );
}

const styles = StyleSheet.create({
  prewarm: {
    position: 'absolute',
    opacity: 0,
  },
});
