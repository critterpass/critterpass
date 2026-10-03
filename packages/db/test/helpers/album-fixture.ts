import { randomUUID } from 'node:crypto';

import type pg from 'pg';

/**
 * Album rows on the fixture trip: the organiser's photo, the guide's pick of it, the member tagged
 * in it, the organiser's album settings and export, the organiser's postcard with its printed
 * mailing, and the organiser's sealed mailing address.
 */
export async function seedAlbumRows(
  tx: pg.PoolClient,
  f: { readonly tripId: string; readonly organiser: string; readonly member: string },
): Promise<void> {
  const photoId = randomUUID();
  await tx.query(
    `INSERT INTO photos (id, trip_id, uploader_id, media_key, sha256, taken_at, width, height)
     VALUES ($1, $2, $3, $4, repeat('a', 64), now(), 4032, 3024)`,
    [photoId, f.tripId, f.organiser, `u/${f.organiser}/photo/${randomUUID()}`],
  );
  await tx.query(
    `INSERT INTO album_picks (trip_id, photo_id, picked_by, rank) VALUES ($1, $2, 'guide', 1)`,
    [f.tripId, photoId],
  );
  await tx.query(
    `INSERT INTO photo_people (photo_id, trip_id, user_id, source) VALUES ($1, $2, $3, 'manual')`,
    [photoId, f.tripId, f.member],
  );
  await tx.query('INSERT INTO album_prefs (trip_id, user_id, auto_ingest) VALUES ($1, $2, true)', [
    f.tripId,
    f.organiser,
  ]);
  await tx.query(
    `INSERT INTO album_exports (id, trip_id, user_id, status) VALUES ($1, $2, $3, 'queued')`,
    [randomUUID(), f.tripId, f.organiser],
  );
  const postcardId = randomUUID();
  await tx.query(
    `INSERT INTO postcards (id, trip_id, photo_id, note, created_by)
     VALUES ($1, $2, $3, 'Same time next year?', $4)`,
    [postcardId, f.tripId, photoId, f.organiser],
  );
  await tx.query(
    `INSERT INTO postcard_mailings (postcard_id, trip_id, payer_id, recipient_ids, vendor)
     VALUES ($1, $2, $3, ARRAY[$3, $4]::uuid[], 'sandbox')`,
    [postcardId, f.tripId, f.organiser, f.member],
  );
  await tx.query(
    `INSERT INTO album_curations (trip_id, note, picks, photos) VALUES ($1, 'I picked 1 keeper.', 1, 1)`,
    [f.tripId],
  );
  await tx.query(
    `INSERT INTO mailing_addresses (user_id, fields_enc, country) VALUES ($1, 'v1:matrix-probe', 'SG')`,
    [f.organiser],
  );
}
