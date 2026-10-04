import { useLocalSearchParams } from 'expo-router';

import { PLAN_IDEAS_SCENES } from '@/features/plan/ideas/dev/lab-scenes';

// Read by tools/scripts/check-release-bundle.ts: a production export must never contain this
// marker, which proves metro.config.js excluded this (dev) route group from the bundle.
export const __CP_DEV_ROUTE__ = true;

/** One plan ideas lab scene, full screen; back returns to the list. */
export default function PlanIdeasScene() {
  const { scene } = useLocalSearchParams<{ scene: string }>();
  const render = PLAN_IDEAS_SCENES[typeof scene === 'string' ? scene : ''];
  return render === undefined ? null : render();
}
