/**
 * The signed-in user's travel history from synced rows: trips they went on, the past trips they
 * reported themselves, and the locals they found. The profile's stats and a crew list's past-trip
 * lines read the same numbers.
 */
import { travelHistory, type TravelHistory } from '@cp/domain';
import { useMemo } from 'react';

import { useLiveRows, useOwnerUid } from '../data/live-rows';
import { usePastTrips } from './past-trips';
import {
  CRITTERS_SQL,
  CRITTERS_TABLES,
  HISTORY_TRIPS_SQL,
  HISTORY_TRIPS_TABLES,
  type HistoryTripRow,
} from '../profile/profile-queries';

/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
const HOME_SQL = 'SELECT home_country, member_since FROM users WHERE id = ?';
const HOME_TABLES = ['users'];
/* eslint-enable lingui/no-unlocalized-strings */

/** `YYYY-MM-DD` on the device's own calendar. */
export function localToday(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const date = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${date}`;
}

export function useTravelHistory(): { readonly history: TravelHistory | null } {
  const uid = useOwnerUid();
  const mine = uid === null ? null : [uid];
  const home = useLiveRows<{ home_country: string | null; member_since: string | null }>(
    HOME_SQL,
    mine,
    HOME_TABLES,
  );
  const trips = useLiveRows<HistoryTripRow>(HISTORY_TRIPS_SQL, mine, HISTORY_TRIPS_TABLES);
  const pastTrips = usePastTrips();
  const critters = useLiveRows<{ n: number }>(CRITTERS_SQL, mine, CRITTERS_TABLES);
  const loaded = home.loaded && trips.loaded && pastTrips.loaded && critters.loaded;
  const history = useMemo(() => {
    if (!loaded) return null;
    return travelHistory({
      trips: trips.rows.map((trip) => ({
        id: trip.id,
        country: trip.country,
        startDate: trip.start_date,
      })),
      pastTrips: pastTrips.rows.map((past) => ({
        id: past.id,
        country: past.country,
        month: past.month,
        placeId: past.place_id,
      })),
      homeCountry: home.rows[0]?.home_country ?? null,
      critters: critters.rows[0]?.n ?? 0,
      memberSince: home.rows[0]?.member_since ?? localToday(),
    });
  }, [loaded, home.rows, trips.rows, pastTrips.rows, critters.rows]);
  return { history };
}
