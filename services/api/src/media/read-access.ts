/**
 * Who may mint a read URL for a media object (docs/api-contracts.md §5.4 "membership checked when
 * minting"): its owner, a member of the trip it is attached to, a reader of the crew chat message
 * it is attached to, or (for an approved avatar photo) anyone sharing an active crew with its owner. `media_objects` is system-only
 * (RLS class S), so the rows are read as `app_system` and trip membership is then asked of
 * `app.is_trip_member` as the caller.
 */
import { withSystem, withUser } from '@cp/db';
import type pg from 'pg';

import { readableKeyOwner, tripMediaKeyTrip } from './purposes';

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
 * Keys attached to a crew chat message the caller can read (members, and former members who kept
 * the chat): the original and the worker's derived thumbnail or AAC. `messages` RLS decides.
 */
async function visibleChatMedia(
  pool: pg.Pool,
  uid: string,
  keys: readonly string[],
): Promise<Set<string>> {
  return withUser(pool, uid, '', async (tx) => {
    const result = await tx.query<{ key: string }>(
      `SELECT k AS key FROM unnest($1::text[]) AS k
        WHERE EXISTS (SELECT 1 FROM messages m
                       WHERE m.attachments @> jsonb_build_array(jsonb_build_object('media_key', k))
                          OR m.attachments @> jsonb_build_array(jsonb_build_object('derived_key', k)))`,
      [keys],
    );
    return new Set(result.rows.map((row) => row.key));
  });
}

/**
 * Signature strokes on a stamp the caller can see signed (`stamp_signatures` RLS: the trip's
 * travellers still in the crew), so each traveller's signature writes itself on the others' stamps.
 */
async function visibleSignatureMedia(
  pool: pg.Pool,
  uid: string,
  keys: readonly string[],
): Promise<Set<string>> {
  return withUser(pool, uid, '', async (tx) => {
    const result = await tx.query<{ key: string }>(
      `SELECT k AS key FROM unnest($1::text[]) AS k
        WHERE EXISTS (SELECT 1 FROM stamp_signatures s WHERE s.stroke_media_key = k)`,
      [keys],
    );
    return new Set(result.rows.map((row) => row.key));
  });
}

/**
 * Trip media the crew shares (recap narration, owned by no traveller): readable by the recap's
 * viewers still in the crew, the same people who read the recap it narrates.
 */
async function visibleTripMedia(
  pool: pg.Pool,
  uid: string,
  keys: readonly string[],
): Promise<boolean> {
  const rows = await withSystem(pool, async (tx) => {
    const result = await tx.query<{ r2_key: string; trip_id: string }>(
      `SELECT r2_key, trip_id FROM media_objects
        WHERE owner_id IS NULL AND r2_key = ANY($1::text[])`,
      [keys],
    );
    return result.rows;
  });
  if (rows.length !== new Set(keys).size) return false;
  if (rows.some((row) => row.trip_id !== tripMediaKeyTrip(row.r2_key))) return false;
  const tripIds = [...new Set(rows.map((row) => row.trip_id))];
  const visible = await withUser(pool, uid, '', async (tx) => {
    const result = await tx.query<{ trip_id: string }>(
      'SELECT t AS trip_id FROM unnest($1::uuid[]) AS t WHERE app.is_recap_viewer(t)',
      [tripIds],
    );
    return new Set(result.rows.map((row) => row.trip_id));
  });
  return tripIds.every((tripId) => visible.has(tripId));
}

/**
 * Keys the caller may read: own objects, media attached to a crew chat message they can read, objects attached to a trip they belong to, or a
 * crewmate's approved avatar photo and its variants.
 */
export async function authorizeReads(
  pool: pg.Pool,
  uid: string,
  keys: readonly string[],
): Promise<boolean> {
  const tripKeys = keys.filter((key) => tripMediaKeyTrip(key) !== undefined);
  if (tripKeys.length > 0) {
    if (!(await visibleTripMedia(pool, uid, tripKeys))) return false;
    const rest = keys.filter((key) => tripMediaKeyTrip(key) === undefined);
    return rest.length === 0 || authorizeReads(pool, uid, rest);
  }
  const owners = keys.map((key) => readableKeyOwner(key));
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

  const unowned = rows.filter((row) => row.owner_id !== uid);
  const chatKeys =
    unowned.length === 0
      ? new Set<string>()
      : await visibleChatMedia(
          pool,
          uid,
          unowned.map((row) => row.r2_key),
        );
  const signatureKeys =
    unowned.length === 0
      ? new Set<string>()
      : await visibleSignatureMedia(
          pool,
          uid,
          unowned.map((row) => row.r2_key),
        );
  const foreign = unowned.filter(
    (row) => !chatKeys.has(row.r2_key) && !signatureKeys.has(row.r2_key),
  );
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
