import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

// Read by tools/scripts/check-release-bundle.ts: a production export must never contain this
// marker, which proves metro.config.js excluded this (dev) route group from the bundle.
export const __CP_DEV_ROUTE__ = true;

/** Navigation target for grow-into-page.tsx's Link.AppleZoom probe — AppleZoom needs a real route
 * to zoom into, unlike the in-screen overlay used for the shared-element/teleport-overlay modes. */
export default function GrowIntoPageDetailScreen() {
  return (
    <View style={styles.container}>
      <Link.AppleZoomTarget>
        <View style={styles.card}>
          <Text style={styles.title}>Detail</Text>
        </View>
      </Link.AppleZoomTarget>
      <Link href="/(dev)/spikes/grow-into-page" style={styles.back}>
        Back
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24, padding: 16 },
  card: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 24,
    backgroundColor: '#4f86ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 24, fontWeight: '700', color: '#fff' },
  back: { fontSize: 16, color: '#4f86ff' },
});
