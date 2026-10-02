/** This phone's unsynced past-trip changes laid over the synced rows (pure, for tests). */
import type { PastTripRow } from '../profile/profile-queries';

export interface PendingPastTrips {
  readonly added: readonly PastTripRow[];
  readonly removed: ReadonlySet<string>;
}

/** Synced rows, minus the ones removed here, plus the ones added here and not yet synced. */
export function mergePastTrips(
  rows: readonly PastTripRow[],
  local: PendingPastTrips,
): PastTripRow[] {
  const synced = new Set(rows.map((row) => row.id));
  return [
    ...rows.filter((row) => !local.removed.has(row.id)),
    ...local.added.filter((row) => !synced.has(row.id) && !local.removed.has(row.id)),
  ];
}
