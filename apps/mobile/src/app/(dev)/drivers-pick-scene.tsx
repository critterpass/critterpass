import { useLocalSearchParams } from 'expo-router';

import { PICK_SCENES } from '@/features/drivers/pick/dev/pick-scenes';

// Read by tools/scripts/check-release-bundle.ts: a production export must never contain this
// marker, which proves metro.config.js excluded this (dev) route group from the bundle.
export const __CP_DEV_ROUTE__ = true;

/** One pick sheet lab scene (6d-2); back returns to the list. */
export default function DriversPickScene() {
  const { scene } = useLocalSearchParams<{ scene: string }>();
  const render = PICK_SCENES[typeof scene === 'string' ? scene : ''];
  return render === undefined ? null : render();
}
