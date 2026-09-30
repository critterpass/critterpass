import { useLocalSearchParams } from 'expo-router';

import { PLAN_VIEWS_SCENES } from '@/features/plan/overview/dev/lab-scenes';

// Read by tools/scripts/check-release-bundle.ts: a production export must never contain this
// marker, which proves metro.config.js excluded this (dev) route group from the bundle.
export const __CP_DEV_ROUTE__ = true;

/** One plan views lab scene, full screen; back returns to the list. */
export default function PlanViewsScene() {
  const { scene } = useLocalSearchParams<{ scene: string }>();
  const render = PLAN_VIEWS_SCENES[typeof scene === 'string' ? scene : ''];
  return render === undefined ? null : render();
}
