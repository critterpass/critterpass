/** The profile over live synced rows; `model` is null until every query has answered once. */
import { airportDataset } from '@cp/content/airports';
import { useMemo } from 'react';

import { useLiveRows, useOwnerUid } from '../data/live-rows';
import { localToday } from '../history/use-travel-history';
import { buildProfile, type ProfileModel } from './profile-model';
import {
  CREW_MEMBERS_SQL,
  CREW_MEMBERS_TABLES,
  CREW_TRIPS_SQL,
  CREW_TRIPS_TABLES,
  CREWS_SQL,
  CREWS_TABLES,
  CRITTERS_SQL,
  CRITTERS_TABLES,
  HISTORY_TRIPS_SQL,
  HISTORY_TRIPS_TABLES,
  ME_SQL,
  ME_TABLES,
  PAST_TRIPS_SQL,
  PAST_TRIPS_TABLES,
  STAMPS_SQL,
  STAMPS_TABLES,
  type CrewMemberRow,
  type CrewRow,
  type CrewTripRow,
  type HistoryTripRow,
  type MeRow,
  type PastTripRow,
  type StampRow,
} from './profile-queries';

export function useProfile(now: () => Date = () => new Date()): {
  readonly model: ProfileModel | null;
} {
  const uid = useOwnerUid();
  const mine = uid === null ? null : [uid];
  const me = useLiveRows<MeRow>(ME_SQL, mine, ME_TABLES);
  const stamps = useLiveRows<StampRow>(STAMPS_SQL, mine, STAMPS_TABLES);
  const trips = useLiveRows<HistoryTripRow>(HISTORY_TRIPS_SQL, mine, HISTORY_TRIPS_TABLES);
  const pastTrips = useLiveRows<PastTripRow>(PAST_TRIPS_SQL, mine, PAST_TRIPS_TABLES);
  const critters = useLiveRows<{ n: number }>(CRITTERS_SQL, mine, CRITTERS_TABLES);
  const crews = useLiveRows<CrewRow>(CREWS_SQL, mine, CREWS_TABLES);
  const crewMembers = useLiveRows<CrewMemberRow>(CREW_MEMBERS_SQL, mine, CREW_MEMBERS_TABLES);
  const crewTrips = useLiveRows<CrewTripRow>(CREW_TRIPS_SQL, mine, CREW_TRIPS_TABLES);
  const loaded =
    me.loaded &&
    stamps.loaded &&
    trips.loaded &&
    pastTrips.loaded &&
    critters.loaded &&
    crews.loaded &&
    crewMembers.loaded &&
    crewTrips.loaded;
  const today = localToday(now());
  const model = useMemo(() => {
    if (!loaded) return null;
    return buildProfile({
      me: me.rows[0] ?? null,
      stamps: stamps.rows,
      trips: trips.rows,
      pastTrips: pastTrips.rows,
      critters: critters.rows[0]?.n ?? 0,
      crews: crews.rows,
      crewMembers: crewMembers.rows,
      crewTrips: crewTrips.rows,
      airports: airportDataset(),
      today,
    });
  }, [
    loaded,
    today,
    me.rows,
    stamps.rows,
    trips.rows,
    pastTrips.rows,
    critters.rows,
    crews.rows,
    crewMembers.rows,
    crewTrips.rows,
  ]);
  return { model };
}
