/**
 * The plan check on this phone's own synced data, for the device flows: the signed-in member's
 * nearest trip that has a crew plan (the staging demo crew's Bali week after a seed), through the
 * real screen. Only in the (dev) lab; trips open the check from the trip map and the day plan.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { useLiveRows } from '@/data/plan/live-rows';
import { useTripStreams } from '@/data/powersync/use-trip-streams';
import { Text } from '@/ui/text/Text';

import { CheckScreen } from '../check-screen';

const TRIPS_SQL = `SELECT id FROM trips WHERE current_version_id IS NOT NULL
  ORDER BY start_date IS NULL, start_date LIMIT 1`;
const TRIPS_TABLES = ['trips'];

export function CheckLive() {
  const trips = useLiveRows<{ id: string }>(TRIPS_SQL, [], TRIPS_TABLES);
  const tripId = trips.rows[0]?.id ?? null;
  // The trip's own streams (the plan check rides them), as the trip screens hold them.
  useTripStreams(tripId);
  if (tripId === null) {
    return <Text variant="body">{trips.loaded ? 'No trip with a plan on this phone.' : '…'}</Text>;
  }
  return <CheckScreen tripId={tripId} />;
}
