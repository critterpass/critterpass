/**
 * A place's stored Foursquare photos (docs/product-decisions.md D24): the api's live read and the
 * worker's warm-up both replace a place's set through here, in the caller's transaction (system
 * role). Only photo ids, address parts, pixel sizes and creation times are written.
 */
import type { FoursquareStoredPhoto } from '@cp/domain';
import type pg from 'pg';

/**
 * Replaces the place's photos with this set, in this order (rank 0 first), and notes the read. A
 * photo that stays keeps its row id, so a client that saved it by id finds it again.
 */
export async function replacePoiFoursquarePhotos(
  tx: pg.PoolClient,
  poiId: string,
  photos: readonly FoursquareStoredPhoto[],
): Promise<void> {
  await tx.query(
    'DELETE FROM poi_foursquare_photos WHERE poi_id = $1 AND NOT (fsq_photo_id = ANY($2::text[]))',
    [poiId, photos.map((photo) => photo.photoId)],
  );
  if (photos.length > 0) {
    await tx.query(
      `INSERT INTO poi_foursquare_photos
         (poi_id, fsq_photo_id, prefix, suffix, width, height, fsq_created_at, rank, fetched_at)
       SELECT $1, t.fsq_photo_id, t.prefix, t.suffix, t.width, t.height, t.fsq_created_at,
              (t.ordinality - 1)::smallint, now()
         FROM unnest($2::text[], $3::text[], $4::text[], $5::int[], $6::int[], $7::timestamptz[])
              WITH ORDINALITY AS t (fsq_photo_id, prefix, suffix, width, height, fsq_created_at, ordinality)
       ON CONFLICT (poi_id, fsq_photo_id) DO UPDATE SET
         prefix = EXCLUDED.prefix,
         suffix = EXCLUDED.suffix,
         width = EXCLUDED.width,
         height = EXCLUDED.height,
         fsq_created_at = EXCLUDED.fsq_created_at,
         rank = EXCLUDED.rank,
         fetched_at = EXCLUDED.fetched_at`,
      [
        poiId,
        photos.map((photo) => photo.photoId),
        photos.map((photo) => photo.prefix),
        photos.map((photo) => photo.suffix),
        photos.map((photo) => photo.width),
        photos.map((photo) => photo.height),
        photos.map((photo) => photo.createdAt),
      ],
    );
  }
  await tx.query(
    `INSERT INTO poi_foursquare_photo_reads (poi_id, read_at) VALUES ($1, now())
     ON CONFLICT (poi_id) DO UPDATE SET read_at = EXCLUDED.read_at`,
    [poiId],
  );
}
