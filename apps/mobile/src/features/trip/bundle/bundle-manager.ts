/**
 * The trip day bundle on the phone. `GET /v1/trips/{id}/offline-bundle` answers, per trip day from
 * today on, a versioned manifest (booking documents, phrase audio, the map region; FX rates, the
 * day's place labels and point forecasts) with signed download URLs. A day whose version is
 * already here costs nothing; otherwise only files not yet on the phone download, tickets first,
 * then phrases, then the map (skipped below 200 MB free, with a note). A download cut off halfway
 * resumes next time: the files already saved stay. The saved state lives in the encrypted,
 * local-only `local_private` table, wiped on sign-out.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, api paths and wire values, never copy. */
import { BUNDLE_ASSET_PRIORITY, type BundleAssetKind } from '@cp/domain';
import type { AbstractPowerSyncDatabase } from '@powersync/common';

import {
  BUNDLE_KIND,
  SAVED_DAYS_SQL,
  savedDayId,
  savedDaysParams,
  type SavedAsset,
  type SavedDay,
  type SavedDayPlace,
  type SavedDayRate,
} from '@/data/trip-day/saved-days';

import type { TripDayServices } from './services';

export { BUNDLE_KIND, savedDayId, type SavedAsset, type SavedDay };

/** A saved day's row read back; null for a row that is not one (a damaged write must not take a screen down). */
export function parseSavedDay(data: string): SavedDay | null {
  try {
    const day = JSON.parse(data) as Partial<SavedDay> | null;
    return day !== null && Array.isArray(day.assets) && Array.isArray(day.missing)
      ? (day as SavedDay)
      : null;
  } catch {
    return null;
  }
}

/** Below this much free space the map is left out (tickets and phrases still come). */
export const MAP_MIN_FREE_BYTES = 200 * 1024 * 1024;

export interface WireAsset {
  readonly kind: BundleAssetKind;
  readonly key: string;
  readonly bytes: number | null;
  readonly label: string;
  readonly ref_id: string | null;
  readonly url: string | null;
}

export interface WireDay {
  readonly local_date: string;
  readonly version: number;
  readonly built_at: string;
  readonly assets: readonly WireAsset[];
  readonly places: readonly SavedDayPlace[];
  readonly fx: readonly SavedDayRate[];
}

function daysOf(body: unknown): WireDay[] {
  const items = (body as { sections?: { days?: { items?: unknown } } } | null)?.sections?.days
    ?.items;
  return Array.isArray(items) ? (items as WireDay[]) : [];
}

/** A file name from the media key: stable per key, safe on every file system. */
export function fileNameFor(key: string): string {
  return key.replace(/[^A-Za-z0-9._-]/gu, '_').slice(-120);
}

export async function readSavedDays(
  db: AbstractPowerSyncDatabase,
  tripId: string,
): Promise<SavedDay[]> {
  const rows = await db.getAll<{ data: string }>(SAVED_DAYS_SQL, savedDaysParams(tripId));
  return rows.map((row) => JSON.parse(row.data) as SavedDay);
}

/** Saves one day: only what changed downloads, in priority order, within the space there is. */
export async function saveDay(
  services: TripDayServices,
  tripId: string,
  day: WireDay,
  before: SavedDay | undefined,
): Promise<SavedDay> {
  const at = new Date(services.now()).toISOString();
  const have = new Map(
    (before?.assets ?? [])
      .filter((asset) => services.exists(asset.uri))
      .map((asset) => [asset.key, asset]),
  );
  const assets: SavedAsset[] = [];
  const missing: SavedDay['missing'][number][] = [];
  const ordered = [...day.assets].sort(
    (a, b) => BUNDLE_ASSET_PRIORITY[a.kind] - BUNDLE_ASSET_PRIORITY[b.kind],
  );
  for (const asset of ordered) {
    const kept = have.get(asset.key);
    if (kept !== undefined) {
      assets.push({ ...kept, label: asset.label });
      continue;
    }
    const free = services.freeBytes();
    const need = asset.bytes ?? 0;
    const tooBig =
      free !== null &&
      (asset.kind === 'map_region' ? free - need < MAP_MIN_FREE_BYTES : free < need);
    if (tooBig) {
      missing.push({ kind: asset.kind, label: asset.label, reason: 'space' });
      continue;
    }
    const uri =
      asset.url === null
        ? null
        : await services.download(asset.url, tripId, fileNameFor(asset.key));
    if (uri === null) missing.push({ kind: asset.kind, label: asset.label, reason: 'failed' });
    else assets.push({ kind: asset.kind, key: asset.key, label: asset.label, uri, savedAt: at });
  }
  return {
    tripId,
    localDate: day.local_date,
    version: day.version,
    builtAt: day.built_at,
    assets,
    missing,
    places: day.places,
    fx: day.fx,
    savedAt: at,
  };
}

export type RefreshOutcome =
  | { readonly kind: 'offline' }
  | { readonly kind: 'error'; readonly code: string }
  | { readonly kind: 'saved'; readonly days: number; readonly downloaded: number };

/** Pulls the trip's day manifests and saves every day that changed (or is incomplete). */
export async function refreshTripDays(
  db: AbstractPowerSyncDatabase,
  services: TripDayServices,
  tripId: string,
): Promise<RefreshOutcome> {
  const read = await services.getJson(`/v1/trips/${encodeURIComponent(tripId)}/offline-bundle`);
  if (read.kind !== 'ok') return read;
  const saved = new Map((await readSavedDays(db, tripId)).map((day) => [day.localDate, day]));
  let downloaded = 0;
  let days = 0;
  for (const day of daysOf(read.value)) {
    const before = saved.get(day.local_date);
    const complete =
      before !== undefined &&
      before.version === day.version &&
      before.missing.length === 0 &&
      before.assets.every((asset) => services.exists(asset.uri));
    if (complete) continue;
    const next = await saveDay(services, tripId, day, before);
    downloaded += next.assets.filter((asset) => asset.savedAt === next.savedAt).length;
    days += 1;
    await db.execute(
      'INSERT OR REPLACE INTO local_private (id, kind, data, fetched_at) VALUES (?, ?, ?, ?)',
      [savedDayId(tripId, day.local_date), BUNDLE_KIND, JSON.stringify(next), next.savedAt],
    );
  }
  return { kind: 'saved', days, downloaded };
}

/** Forgets a trip's saved days and deletes their files (Settings > Offline, "Remove"). */
export async function removeTripDays(
  db: AbstractPowerSyncDatabase,
  services: TripDayServices,
  tripId: string,
): Promise<void> {
  services.removeFolder(tripId);
  await db.execute('DELETE FROM local_private WHERE kind = ? AND id LIKE ?', [
    BUNDLE_KIND,
    `${BUNDLE_KIND}:${tripId}:%`,
  ]);
}
