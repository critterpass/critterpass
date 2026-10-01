/**
 * A destination's slug from the synced `destinations` rows, by id: the subject of its editorial
 * media. Null until the row is on the device (or for an id that is not a destination).
 */
import { useLiveRows } from './live-rows';

// eslint-disable-next-line lingui/no-unlocalized-strings -- SQL, never copy.
const SLUG_SQL = 'SELECT slug FROM destinations WHERE id = ?';
const SLUG_TABLES = ['destinations'];

export function useDestinationSlug(destinationId: string | null): string | null {
  const { rows } = useLiveRows<{ slug: string }>(
    SLUG_SQL,
    destinationId === null || destinationId === '' ? null : [destinationId],
    SLUG_TABLES,
  );
  return rows[0]?.slug ?? null;
}
