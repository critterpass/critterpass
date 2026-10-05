/**
 * Whether a reader ever told us what they want: a must-do on this trip, or taste answers on file.
 * A version may only claim "you picked" for someone who did.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { useLiveRows } from './rows';

const WISHES_SQL = `SELECT
    (SELECT count(*) FROM must_dos WHERE trip_id = ?1 AND owner_id = ?2 AND deleted_at IS NULL)
  + (SELECT count(*) FROM taste_profiles
      WHERE user_id = ?2 AND tags IS NOT NULL AND tags NOT IN ('', '[]')) AS n`;

export function useHasWishes(tripId: string | null, uid: string | null): boolean {
  const { rows } = useLiveRows<{ n: number | null }>(
    WISHES_SQL,
    tripId === null || uid === null ? null : [tripId, uid],
    ['must_dos', 'taste_profiles'],
  );
  return Number(rows[0]?.n ?? 0) > 0;
}
