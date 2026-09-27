/**
 * `/v1/map/regions/{destination_id}` (docs/api-contracts.md §5.5 doc delta): the offline-pack
 * manifest a mobile client reads before downloading a destination's PMTiles archive
 * (`apps/mobile/src/data/places/useRegionPack.ts`, T7b) — url, byte size (for the storage/progress
 * UI) and version (so a client with a stale local file knows to re-download), plus a live
 * `poi_count` so "no curated places yet" (coverage tiers) can be decided client-side without
 * a second request. Reads the *latest* uploaded version for the destination (`map_regions` keeps
 * one row per `(destination_id, version)` precisely so an in-flight download is never served a
 * manifest for a file `tools/maps/upload-r2.ts` re-uploads mid-request).
 */
import { DomainError } from '@cp/domain';
import type pg from 'pg';

export interface MapRegionManifest {
  readonly url: string;
  readonly bytes: number;
  readonly version: string;
  readonly poiCount: number;
}

interface MapRegionRow {
  readonly pmtiles_key: string;
  readonly bytes: string; // bigint arrives as a string from `pg`
  readonly version: string;
}

export async function getMapRegionManifest(
  tx: pg.PoolClient,
  destinationId: string,
  tilesBaseUrl: string,
): Promise<MapRegionManifest> {
  const { rows } = await tx.query<MapRegionRow>(
    `SELECT pmtiles_key, bytes, version FROM map_regions
     WHERE destination_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [destinationId],
  );
  const row = rows[0];
  if (row === undefined) {
    throw new DomainError('NOT_FOUND', { reason: 'no map region for destination', destinationId });
  }

  const { rows: poiRows } = await tx.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM pois WHERE destination_id = $1 AND status = 'active'`,
    [destinationId],
  );
  const poiCount = Number(poiRows[0]?.count ?? '0');

  return {
    url: `${tilesBaseUrl}/${row.pmtiles_key}`,
    bytes: Number(row.bytes),
    version: row.version,
    poiCount,
  };
}
