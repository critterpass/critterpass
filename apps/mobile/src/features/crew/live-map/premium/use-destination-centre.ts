import { useLiveRows } from '@/data/powersync/live-rows';

// eslint-disable-next-line lingui/no-unlocalized-strings -- SQL, never copy.
const CENTRE_SQL = `SELECT avg(lat) AS lat, avg(lng) AS lng FROM pois
  WHERE destination_id = ? AND lat IS NOT NULL AND lng IS NOT NULL`;
const CENTRE_TABLES = ['pois'];

/**
 * The middle of the destination's places on this phone: where the map opens before anyone shares
 * or a meet-up is set, so it lands on the trip's own streets (and its tiles), not somewhere else.
 */
export function useDestinationCentre(
  destinationId: string | null,
): readonly [number, number] | null {
  const row = useLiveRows<{ lat: number | null; lng: number | null }>(
    CENTRE_SQL,
    destinationId === null ? null : [destinationId],
    CENTRE_TABLES,
  ).rows[0];
  if (row === undefined || row.lat === null || row.lng === null) return null;
  return [row.lng, row.lat];
}
