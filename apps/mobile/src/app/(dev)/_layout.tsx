import { Redirect, Stack } from 'expo-router';

import { devToolsAvailable } from '@/lib/dev-tools/variant';

// Read by tools/scripts/check-release-bundle.ts: a production export must never contain this
// marker, which proves metro.config.js excluded this (dev) route group from the bundle.
export const __CP_DEV_ROUTE__ = true;

/**
 * Sheets and rises (the gallery demos of `Sheet` / `RiseModal`, the Start fresh confirm):
 * transparent so the screen beneath stays visible.
 */
const MODAL_ROUTES = ['gallery/sheet-demo', 'gallery/rise-demo'] as const;

/**
 * Dev-only group (gallery, motion lab, sticker lab, spikes). The real exclusion is build-time
 * (Metro `blockList` for APP_VARIANT=production); this redirect only keeps a mis-configured
 * build from showing internal harnesses — it is not a security boundary.
 */
export default function DevLayout() {
  if (!devToolsAvailable()) return <Redirect href="/" />;
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="gallery/zoom-detail" options={{ animation: 'fade' }} />
      {MODAL_ROUTES.map((name) => (
        <Stack.Screen
          key={name}
          name={name}
          options={{ presentation: 'transparentModal', animation: 'none' }}
        />
      ))}
    </Stack>
  );
}
