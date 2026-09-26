import { StyleSheet, Text, View } from 'react-native';

// Read by tools/scripts/check-release-bundle.ts: a production export must never contain this
// marker, which proves metro.config.js excluded this (dev) route group from the bundle.
export const __CP_DEV_ROUTE__ = true;

export default function DevProbeScreen() {
  return (
    <View style={styles.container}>
      <Text accessibilityRole="header" style={styles.title}>
        Dev route probe
      </Text>
      <Text>This screen only exists in development, staging and preview builds.</Text>
    </View>
  );
}

// Dev-only route (never bundled in production, see the marker above); stays on the platform
// default text size rather than importing @cp/design-tokens, which route files may not import
// directly (docs/system-architecture.md §3 — styling tokens flow through the ui/feature layers).
const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
  },
  title: {
    fontWeight: 'bold',
  },
});
