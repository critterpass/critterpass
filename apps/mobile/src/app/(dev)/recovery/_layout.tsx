import { Stack } from 'expo-router';

import { PremiumGroupErrorBoundary } from '@/features/home/premium/recovery/premium-error-boundary';

// Read by tools/scripts/check-release-bundle.ts: a production export must never contain this
// marker, which proves metro.config.js excluded this (dev) route group from the bundle.
export const __CP_DEV_ROUTE__ = true;

// A screen here that fails shows the same recovery as any area's (the "That didn't load" sheet).
export { PremiumGroupErrorBoundary as ErrorBoundary };

/** The recovery check: a page that fails on purpose, under the areas' error boundary. */
export default function DevRecoveryLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
