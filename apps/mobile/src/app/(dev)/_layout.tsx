import Constants from 'expo-constants';
import { Redirect, Stack } from 'expo-router';

// Read by tools/scripts/check-release-bundle.ts: a production export must never contain this
// marker, which proves metro.config.js excluded this (dev) route group from the bundle.
export const __CP_DEV_ROUTE__ = true;

function devRoutesEnabled(): boolean {
  if (__DEV__) return true;
  const variant: unknown = Constants.expoConfig?.extra?.appVariant;
  return variant !== 'production';
}

/**
 * Dev-only group (gallery, motion lab, sticker lab, spikes). The real exclusion is build-time
 * (Metro `blockList` for APP_VARIANT=production); this redirect only keeps a mis-configured
 * build from showing internal harnesses — it is not a security boundary.
 */
export default function DevLayout() {
  if (!devRoutesEnabled()) return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
