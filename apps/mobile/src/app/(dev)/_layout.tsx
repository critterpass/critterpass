import { Redirect, Stack } from 'expo-router';

import { devToolsAvailable } from '@/lib/dev-tools/variant';
import { sheetRouteOptions } from '@/ui/premium/shell';

// Read by tools/scripts/check-release-bundle.ts: a production export must never contain this
// marker, which proves metro.config.js excluded this (dev) route group from the bundle.
export const __CP_DEV_ROUTE__ = true;

/**
 * Dev-only group (labs, live checks, spikes); Start fresh is a native sheet. The real exclusion is build-time
 * (Metro `blockList` for APP_VARIANT=production); this redirect only keeps a mis-configured
 * build from showing internal harnesses — it is not a security boundary.
 */
export default function DevLayout() {
  if (!devToolsAvailable()) return <Redirect href="/" />;
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="start-fresh" options={sheetRouteOptions('fit')} />
    </Stack>
  );
}
