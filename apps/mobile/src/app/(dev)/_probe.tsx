import { Trans } from '@lingui/react/macro';
import { StyleSheet, View } from 'react-native';
import { Scaffold, Text } from '@/ui';

// Read by tools/scripts/check-release-bundle.ts: a production export must never contain this
// marker, which proves metro.config.js excluded this (dev) route group from the bundle.
export const __CP_DEV_ROUTE__ = true;

export default function DevProbeScreen() {
  return (
    <Scaffold edges={['top', 'bottom']}>
      <View style={styles.container}>
        <Text accessibilityRole="header" variant="h3">
          <Trans id="common.devProbe.title">Dev route probe</Trans>
        </Text>
        <Text>
          <Trans id="common.devProbe.body">
            This screen only exists in development, staging and preview builds.
          </Trans>
        </Text>
      </View>
    </Scaffold>
  );
}

// Dev-only route (never bundled in production, see the marker above); text comes from the
// component library rather than @cp/design-tokens, which route files may not import directly
// (docs/system-architecture.md §3 — styling tokens flow through the ui/feature layers).
const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
  },
});
