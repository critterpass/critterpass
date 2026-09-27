/**
 * Who may mint a read URL for a media object (docs/api-contracts.md §5.4 "membership checked when
 * minting"): its owner, or a member of the trip it is attached to. `media_objects` is system-only
 * (RLS class S), so the rows are read as `app_system` and trip membership is then asked of
 * `app.is_trip_member` as the caller.
 */
import { withSystem, withUser } from '@cp/db';
import type pg from 'pg';

import { parseMediaKey } from './purposes';

/** Keys the caller may read: own objects, or objects attached to a trip they belong to. */
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

  const tripIds = [
    ...new Set(rows.filter((row) => row.owner_id !== uid).map((row) => row.trip_id)),
  ];
  if (tripIds.includes(null)) return false;
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
