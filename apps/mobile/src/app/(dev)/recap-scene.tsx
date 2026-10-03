import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { RECAP_SCENES } from '@/features/recap/dev/recap-scenes';

// Read by tools/scripts/check-release-bundle.ts: a production export must never contain this
// marker, which proves metro.config.js excluded this (dev) route group from the bundle.
export const __CP_DEV_ROUTE__ = true;

/**
 * One recap lab scene, full screen; back returns to the list. A screenshot flow taps the
 * invisible target at the start edge on iOS, where an edge swipe over a full-bleed scene is not
 * reliable. It sits in the gutter, halfway down, clear of the status bar (which takes taps there).
 */
export default function RecapSceneRoute() {
  const { scene } = useLocalSearchParams<{ scene: string }>();
  const render = RECAP_SCENES[typeof scene === 'string' ? scene : ''];
  if (render === undefined) return null;
  return (
    <View style={styles.fill}>
      {render()}
      <Pressable
        testID="recap-scene-back"
        accessibilityLabel="Back to scenes"
        style={styles.back}
        onPress={() => router.back()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  back: { position: 'absolute', top: '50%', start: 0, width: 16, height: 44 },
});
