/**
 * A place's kept Foursquare photos as media assets (docs/product-decisions.md D24): what the
 * subject media read adds for `poi:<id>` subjects when the caller asks for the `foursquare` source.
 * Image addresses are built from the stored parts for the sizes the app picks from; each asset
 * carries Foursquare's credit. No call to Foursquare is made here.
 */
import { foursquarePhotoAsset, type PlaceMediaAsset } from '@cp/domain';
import type pg from 'pg';

const POI_SUBJECT = /^poi:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/u;

interface PhotoRow {
  id: string;
  poi_id: string;
  rank: number;
  prefix: string;
  suffix: string;
  width: number;
  height: number;
}

/** The stored photos of the places among `subjects`, each place's in Foursquare's order. */
export async function readFoursquarePhotoAssets(
  tx: pg.PoolClient,
  subjects: readonly string[],
): Promise<PlaceMediaAsset[]> {
  const poiIds = subjects.flatMap((subject) => POI_SUBJECT.exec(subject)?.[1] ?? []);
  if (poiIds.length === 0) return [];
  const { rows } = await tx.query<PhotoRow>(
    `SELECT id, poi_id, rank, prefix, suffix, width, height
       FROM poi_foursquare_photos
      WHERE poi_id = ANY($1::uuid[])
      ORDER BY rank, poi_id`,
    [poiIds],
  );
  return rows.map((row) =>
    foursquarePhotoAsset({
      id: row.id,
      poiId: row.poi_id,
      rank: row.rank,
      photo: { prefix: row.prefix, suffix: row.suffix, width: row.width, height: row.height },
    }),
  );
}
