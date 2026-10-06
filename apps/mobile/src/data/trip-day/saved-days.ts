/**
 * The trip days saved on the phone for offline use, as rows of the encrypted, local-only
 * `local_private` table (one per trip and local date, wiped on sign-out). The trip area writes
 * them (features/trip/bundle/bundle-manager.ts); Home reads them for its offline line.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and row kinds, never copy. */
import type { BundleAssetKind } from '@cp/domain';

export const BUNDLE_KIND = 'trip_day_bundle';

export type SavedDayPlace = { readonly poi_id: string; readonly name: string };
export type SavedDayRate = { base: string; quote: string; rate: string; as_of: string };

export interface SavedAsset {
  readonly kind: BundleAssetKind;
  readonly key: string;
  readonly label: string;
  readonly uri: string;
  readonly savedAt: string;
}

export interface SavedDay {
  readonly tripId: string;
  readonly localDate: string;
  readonly version: number;
  readonly builtAt: string;
  readonly assets: readonly SavedAsset[];
  /** Named in the manifest but not on the phone (no signal, no space, no URL). */
  readonly missing: readonly {
    readonly kind: BundleAssetKind;
    readonly label: string;
    readonly reason: 'space' | 'failed';
  }[];
  readonly places: readonly SavedDayPlace[];
  readonly fx: readonly SavedDayRate[];
  readonly savedAt: string;
}

export function savedDayId(tripId: string, localDate: string): string {
  return `${BUNDLE_KIND}:${tripId}:${localDate}`;
}

/** Every saved day of one trip: `SAVED_DAYS_SQL` with `savedDaysParams(tripId)`. */
export const SAVED_DAYS_SQL = 'SELECT data FROM local_private WHERE kind = ? AND id LIKE ?';

export function savedDaysParams(tripId: string): [string, string] {
  return [BUNDLE_KIND, `${savedDayId(tripId, '')}%`];
}
