/**
 * What the album commands share: who may add to and curate a trip's album (a traveller on the
 * trip: an active crew member who has not answered "out", or an organiser), and the photo as its
 * caller may see it.
 */
import { DomainError } from '@cp/domain';
import type pg from 'pg';

/** `NOT_FOUND` unless the caller travels on the trip (nothing about the trip leaks). */
export async function requireTraveller(tx: pg.PoolClient, tripId: string): Promise<void> {
  const { rows } = await tx.query<{ ok: boolean }>(
    `SELECT app.is_trip_member($1) AND (
       app.is_trip_organiser($1) OR EXISTS (
         SELECT 1 FROM trip_participants
          WHERE trip_id = $1 AND user_id = app.uid() AND rsvp <> 'out'
       )
     ) AS ok`,
    [tripId],
  );
  if (rows[0]?.ok !== true) throw new DomainError('NOT_FOUND', { reason: 'trip' });
}

export interface VisiblePhoto {
  readonly id: string;
  readonly trip_id: string;
  readonly uploader_id: string;
}

/** A live photo of a trip the caller travels on; `NOT_FOUND` otherwise. */
export async function travellerPhoto(tx: pg.PoolClient, photoId: string): Promise<VisiblePhoto> {
  const { rows } = await tx.query<VisiblePhoto>(
    'SELECT id, trip_id, uploader_id FROM photos WHERE id = $1 AND deleted_at IS NULL',
    [photoId],
  );
  const photo = rows[0];
  if (photo === undefined) throw new DomainError('NOT_FOUND', { reason: 'photo' });
  await requireTraveller(tx, photo.trip_id);
  return photo;
}
