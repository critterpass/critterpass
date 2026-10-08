/** Which of the crew's trips the wallet shows. */
/* eslint-disable lingui/no-unlocalized-strings -- status values, never copy. */
import type { TripRow } from './queries';

const UNDER_WAY = new Set(['in_trip']);
const ENDED = new Set(['post_trip', 'archived']);

/**
 * The trip the wallet was opened for when it is one of the crew's, else the trip under way, else
 * the next one ahead, else the latest that ended.
 */
export function pickTrip(
  trips: readonly TripRow[],
  openedFor: string | null = null,
): TripRow | null {
  const asked = openedFor === null ? undefined : trips.find((trip) => trip.id === openedFor);
  if (asked !== undefined) return asked;
  const underWay = trips.find((trip) => UNDER_WAY.has(trip.status));
  if (underWay !== undefined) return underWay;
  const ahead = trips
    .filter((trip) => !ENDED.has(trip.status))
    .sort((a, b) => (a.start_date ?? '9999').localeCompare(b.start_date ?? '9999'));
  return ahead[0] ?? trips.find((trip) => ENDED.has(trip.status)) ?? null;
}
