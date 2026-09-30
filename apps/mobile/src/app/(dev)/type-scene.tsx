import { router, useLocalSearchParams } from 'expo-router';

import { TypeLabScene } from '@/ui/text/dev/TypeLabScene';
import { TYPE_LAB_PAGES } from '@/ui/text/dev/type-lab-rows';

// Read by tools/scripts/check-release-bundle.ts: a production export must never contain this
// marker, which proves metro.config.js excluded this (dev) route group from the bundle.
export const __CP_DEV_ROUTE__ = true;

/** One type lab page, full screen; back returns to the list. */
export default function TypeScene() {
  const { page } = useLocalSearchParams<{ page: string }>();
  const found = TYPE_LAB_PAGES.find((entry) => entry.id === page);
  return found === undefined ? null : <TypeLabScene page={found} onBack={() => router.back()} />;
}
