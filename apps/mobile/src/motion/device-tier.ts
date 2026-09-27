import { totalMemory } from 'expo-device';

export type DeviceTier = 'low' | 'mid' | 'high';

const LOW_TIER_MAX_BYTES = 3 * 1024 * 1024 * 1024;
const MID_TIER_MAX_BYTES = 6 * 1024 * 1024 * 1024;

/**
 * Coarse device tier from total RAM, used by the motion budgets in docs/system-architecture.md §9
 * (≤2 concurrent draw-ons, ≤30 animated views, confetti ≤40 on low-tier). `expo-device`'s
 * `totalMemory` is `null` on web and on platforms that cannot report it; those default to `'mid'`
 * rather than assuming the worst on a platform this budget was never measured against.
 */
export function tierFromTotalMemory(totalMemoryBytes: number | null): DeviceTier {
  if (totalMemoryBytes === null) return 'mid';
  if (totalMemoryBytes <= LOW_TIER_MAX_BYTES) return 'low';
  if (totalMemoryBytes <= MID_TIER_MAX_BYTES) return 'mid';
  return 'high';
}

/** The current device's tier. RAM does not change at runtime, so this is computed once. */
export const deviceTier: DeviceTier = tierFromTotalMemory(totalMemory);

export function isLowTier(tier: DeviceTier): boolean {
  return tier === 'low';
}
