/**
 * The trip's redraft quota as the organiser sees it. The server counts a redraft the moment it is
 * asked for (its reservation holds a unit) and gives the unit back if the job fails or cannot beat
 * the day, so the counter here leaves out reservations whose job has not delivered yet: a unit is
 * shown as used only once a result is in. Unlimited trips (boosted) show no limit; their silent
 * fair-use cap is never shown as one.
 */

/** `trip_entitlements.redraft_limit` stores "unlimited" as the int4 maximum. */
export const UNLIMITED_STORED = 2_147_483_647;
/** A trip without an entitlements row yet has the free limit. */
export const FREE_REDRAFTS = 3;

export interface RedraftQuota {
  readonly used: number;
  /** null: unlimited. */
  readonly limit: number | null;
}

export interface QuotaInput {
  /** `usage_counters.count` for the trip's `redrafts` (includes reserved units). */
  readonly counted: number;
  /** `trip_entitlements.redraft_limit`, or null without a row. */
  readonly storedLimit: number | null;
  /** Reserved units whose job is still queued or running (not delivered yet). */
  readonly undelivered: number;
}

export function redraftQuota({ counted, storedLimit, undelivered }: QuotaInput): RedraftQuota {
  const stored = storedLimit ?? FREE_REDRAFTS;
  return {
    used: Math.max(0, counted - undelivered),
    limit: stored >= UNLIMITED_STORED ? null : stored,
  };
}

/**
 * What tapping REDRAFT does: go straight ahead, raise the last-free-redraft interstitial first,
 * or (none left) offer the boost. A free fit-in redraft for a late must-do never counts.
 */
export type RedraftGate =
  | { readonly kind: 'go' }
  | { readonly kind: 'last'; readonly n: number; readonly limit: number }
  | { readonly kind: 'spent'; readonly limit: number };

export function redraftGate(quota: RedraftQuota, free: boolean): RedraftGate {
  if (free || quota.limit === null) return { kind: 'go' };
  const left = quota.limit - quota.used;
  if (left <= 0) return { kind: 'spent', limit: quota.limit };
  if (left === 1) return { kind: 'last', n: quota.used + 1, limit: quota.limit };
  return { kind: 'go' };
}
