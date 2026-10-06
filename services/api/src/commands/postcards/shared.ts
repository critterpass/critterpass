/**
 * What the postcard commands share: the postcard as its caller may see it (a live postcard of a
 * trip they travel on), the creator-only rule for changing it, the note length a format prints,
 * and the trip's travellers (who a postcard can go to).
 */
import { DomainError, POSTCARD_NOTE_MAX, type CreatePostcardPayload } from '@cp/domain';
import type pg from 'pg';

import { requireTraveller } from '../album/shared';

export interface VisiblePostcard {
  readonly id: string;
  readonly trip_id: string;
  readonly created_by: string;
  readonly format: CreatePostcardPayload['format'];
  readonly photo_id: string | null;
  readonly note: string;
}

/** A live postcard of a trip the caller travels on; `NOT_FOUND` otherwise. */
export async function travellerPostcard(
  tx: pg.PoolClient,
  postcardId: string,
): Promise<VisiblePostcard> {
  const { rows } = await tx.query<VisiblePostcard>(
    `SELECT id, trip_id, created_by, format, photo_id, note
       FROM postcards WHERE id = $1 AND deleted_at IS NULL`,
    [postcardId],
  );
  const postcard = rows[0];
  if (postcard === undefined) throw new DomainError('NOT_FOUND', { reason: 'postcard' });
  await requireTraveller(tx, postcard.trip_id);
  return postcard;
}

/** Only the traveller who made a postcard changes, sends or mails it. */
export function requireCreator(postcard: VisiblePostcard, uid: string): void {
  if (postcard.created_by !== uid) throw new DomainError('FORBIDDEN', { reason: 'not_creator' });
}

export function checkNote(format: VisiblePostcard['format'], note: string): void {
  if (note.length > POSTCARD_NOTE_MAX[format]) {
    throw new DomainError('VALIDATION', {
      reason: 'note_too_long',
      max: POSTCARD_NOTE_MAX[format],
    });
  }
}

/** The front photo must be a live photo of the postcard's own trip. */
export async function checkPhoto(
  tx: pg.PoolClient,
  tripId: string,
  photoId: string | null,
): Promise<void> {
  if (photoId === null) return;
  const { rowCount } = await tx.query(
    'SELECT 1 FROM photos WHERE id = $1 AND trip_id = $2 AND deleted_at IS NULL',
    [photoId, tripId],
  );
  if (rowCount === 0) throw new DomainError('NOT_FOUND', { reason: 'photo' });
}

/** The trip's travellers: active crew who have not answered "out", and its organisers. */
export async function tripTravellers(tx: pg.PoolClient, tripId: string): Promise<string[]> {
  const { rows } = await tx.query<{ user_id: string }>(
    `SELECT tp.user_id FROM trip_participants tp
       JOIN trips t ON t.id = tp.trip_id
       JOIN crew_members cm ON cm.crew_id = t.crew_id AND cm.user_id = tp.user_id
      WHERE tp.trip_id = $1 AND cm.status = 'active' AND (tp.rsvp <> 'out' OR tp.role = 'organiser')
      ORDER BY tp.user_id`,
    [tripId],
  );
  return rows.map((row) => row.user_id);
}
