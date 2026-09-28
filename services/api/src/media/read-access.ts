/**
 * Who may mint a read URL for a media object (docs/api-contracts.md §5.4 "membership checked when
 * minting"): its owner, a member of the trip it is attached to, or (for an approved avatar
 * photo) anyone sharing an active crew with its owner. `media_objects` is system-only
 * (RLS class S), so the rows are read as `app_system` and trip membership is then asked of
 * `app.is_trip_member` as the caller.
 */
import { withSystem, withUser } from '@cp/db';
import type pg from 'pg';

import { parseMediaKey } from './purposes';

/**
 * Whether every key is an approved photo avatar (or one of its rendered variants) the caller can
 * see: `avatars` RLS limits the rows to their own and their active crewmates'.
 */
async function visibleAvatarMedia(
  pool: pg.Pool,
  uid: string,
  keys: readonly string[],
): Promise<boolean> {
  const visible = await withUser(pool, uid, '', async (tx) => {
    const result = await tx.query<{ key: string }>(
      `SELECT k AS key FROM unnest($1::text[]) AS k
       WHERE EXISTS (
         SELECT 1 FROM avatars a
         WHERE a.moderation_status = 'approved'
           AND (a.media_key = k OR EXISTS (
             SELECT 1 FROM jsonb_each_text(a.variant_keys) v WHERE v.value = k)))`,
      [keys],
    );
    return new Set(result.rows.map((row) => row.key));
  });
  return keys.every((key) => visible.has(key));
}

/**
 * Keys the caller may read: own objects, objects attached to a trip they belong to, or a
 * crewmate's approved avatar photo and its variants.
 */
export async function authorizeReads(
  pool: pg.Pool,
  uid: string,
  keys: readonly string[],
): Promise<boolean> {
  const owners = keys.map((key) => parseMediaKey(key)?.ownerId);
  if (owners.some((owner) => owner === undefined)) return false;

  // Each lookup names the key's owner so it stays on media_objects' owner index.
  const rows = await withSystem(pool, async (tx) => {
    const result = await tx.query<{ r2_key: string; owner_id: string; trip_id: string | null }>(
      `SELECT m.r2_key, m.owner_id, m.trip_id
         FROM unnest($1::uuid[], $2::text[]) AS k(owner_id, r2_key)
         JOIN media_objects m ON m.owner_id = k.owner_id AND m.r2_key = k.r2_key`,
      [owners, keys],
    );
    return result.rows;
  });
  const byKey = new Map(rows.map((row) => [row.r2_key, row]));
  if (keys.some((key) => !byKey.has(key))) return false;

  const foreign = rows.filter((row) => row.owner_id !== uid);
  const avatarKeys = foreign.filter((row) => row.trip_id === null).map((row) => row.r2_key);
  if (avatarKeys.length > 0 && !(await visibleAvatarMedia(pool, uid, avatarKeys))) return false;
  const tripIds = [
    ...new Set(foreign.flatMap((row) => (row.trip_id === null ? [] : [row.trip_id]))),
  ];
  if (tripIds.length === 0) return true;

  const visible = await withUser(pool, uid, '', async (tx) => {
    const result = await tx.query<{ trip_id: string }>(
      'SELECT t AS trip_id FROM unnest($1::uuid[]) AS t WHERE app.is_trip_member(t)',
      [tripIds],
    );
    return new Set(result.rows.map((row) => row.trip_id));
  });
  return tripIds.every((tripId) => tripId !== null && visible.has(tripId));
}
