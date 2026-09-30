/**
 * The trip day part of `GET /v1/trips/{trip_id}/offline-bundle` (docs/api-contracts.md §5.5): the
 * bookings area owns the route and its membership check; this adds the `days` section, today's
 * and every later day's manifest on the trip's clock, with a download URL per asset signed for the
 * media worker (24 hours). A device compares each day's `version` with what it holds and fetches
 * only what changed. Rows are read as the caller, so RLS keeps the manifests to the trip's crew.
 */
import { withUser } from '@cp/db';
import { bundleManifestSchema, toLocalWallTime } from '@cp/domain';

import {
  registerOfflineBundleSection,
  type OfflineBundleContext,
  type OfflineBundleDeps,
} from '../bookings/offline-bundle';
import { mintReadUrl } from '../media/sign';

/** Day bundle downloads stay valid for a day (docs/api-contracts.md §5.5). */
export const DAY_BUNDLE_URL_TTL_SECONDS = 24 * 60 * 60;
const MAX_DAYS = 14;

export interface BundledDayAsset {
  readonly kind: string;
  readonly key: string;
  readonly bytes: number | null;
  readonly label: string;
  readonly ref_id: string | null;
  readonly url: string | null;
  readonly expires_at: string | null;
}

async function daysSection(deps: OfflineBundleDeps, context: OfflineBundleContext) {
  const rows = await withUser(deps.pool, context.uid, 'offline-bundle', async (tx) => {
    const trip = await tx.query<{ tz: string | null }>(
      `SELECT coalesce(t.tz, d.tz) AS tz FROM trips t
         LEFT JOIN destinations d ON d.id = t.destination_id WHERE t.id = $1`,
      [context.tripId],
    );
    const today = toLocalWallTime(context.now, trip.rows[0]?.tz ?? 'UTC').date;
    const { rows: days } = await tx.query<{
      local_date: string;
      version: number;
      built_at: Date;
      manifest: unknown;
    }>(
      `SELECT local_date::text AS local_date, version, built_at, manifest FROM offline_bundles
        WHERE trip_id = $1 AND local_date >= $2::date ORDER BY local_date LIMIT $3`,
      [context.tripId, today, MAX_DAYS],
    );
    return days;
  });
  const expiresAt = Math.floor(context.now.getTime() / 1000) + DAY_BUNDLE_URL_TTL_SECONDS;
  const expires = new Date(expiresAt * 1000).toISOString();
  const items = [];
  for (const row of rows) {
    const manifest = bundleManifestSchema.safeParse(row.manifest);
    if (!manifest.success) continue;
    const { assets, ...rest } = manifest.data;
    const signed: BundledDayAsset[] = [];
    for (const asset of assets) {
      const url =
        deps.signing === undefined ? null : await mintReadUrl(deps.signing, asset.key, expiresAt);
      signed.push({ ...asset, url, expires_at: url === null ? null : expires });
    }
    items.push({
      ...rest,
      version: row.version,
      built_at: row.built_at.toISOString(),
      assets: signed,
    });
  }
  return { items };
}

/** Adds the `days` section to every offline bundle (once, at boot). */
export function registerTripDayBundleSection(): void {
  registerOfflineBundleSection('days', daysSection);
}
