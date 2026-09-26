import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BUNDLED_FONT_FAMILIES, useFontsReady } from '@/lib/fonts';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const fontsReady = useFontsReady();
  const [prewarmed, setPrewarmed] = useState(false);

  // Render one hidden glyph per bundled face for a frame before revealing the app: this forces
  // the OS to rasterise each font's glyph atlas once up front, so the first *visible* text using
  // it doesn't stutter (design-system.md F-002 "fonts prewarmed before first hero paint").
  useEffect(() => {
    if (!fontsReady) return undefined;
    const frame = requestAnimationFrame(() => setPrewarmed(true));
    return () => cancelAnimationFrame(frame);
  }, [fontsReady]);

  useEffect(() => {
    if (fontsReady && prewarmed) {
      void SplashScreen.hideAsync();
    }
  }, [fontsReady, prewarmed]);

  if (!fontsReady) return null;

  return (
    <>
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
    </>
  );
}

const styles = StyleSheet.create({
  prewarm: {
    position: 'absolute',
    opacity: 0,
  },
});
