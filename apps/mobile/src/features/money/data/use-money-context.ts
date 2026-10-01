/**
 * `useMoneyContext(tripId?)`: the signed-in member, their crew, the trip Money shows and its
 * members, all from synced rows. While a money screen is open it holds the trip's sync stream, so
 * the trip's expenses, shares and edit history reach the device (the ledger and payments ride the
 * crew stream, which is always on).
 */
/* eslint-disable lingui/no-unlocalized-strings -- stream names and status values, never copy. */
import { toCountryCode } from '@cp/domain';
import { useMemo } from 'react';

import { OWNER_UID_KEY } from '@/data/powersync/local-tables';
import { useTripStreams } from '@/data/powersync/use-trip-streams';
import { useLocale } from '@/lib/i18n/use-locale';

import {
  crewCurrencyOf,
  pickCrew,
  pickTrip,
  splitMembers,
  toMembers,
  toTrip,
  type MoneyCrew,
  type MoneyMember,
  type MoneyTrip,
} from './context';
import { useLiveRows } from './live-rows';
import {
  CREWS_SQL,
  CREWS_TABLES,
  MEMBERS_SQL,
  MEMBERS_TABLES,
  PARTICIPANTS_SQL,
  PARTICIPANTS_TABLES,
  PROFILE_SQL,
  PROFILE_TABLES,
  TRIPS_SQL,
  TRIPS_TABLES,
  UID_SQL,
  UID_TABLES,
  type CrewRow,
  type MemberRow,
  type ProfileRow,
  type TripRow,
} from './queries';

export interface MoneyContext {
  readonly status: 'loading' | 'no_crew' | 'no_trip' | 'ready';
  readonly uid: string | null;
  readonly locale: string;
  readonly homeCurrency: string | null;
  /** The member's home country as its ISO code (profiles store a name or a code). */
  readonly homeCountry: string | null;
  readonly crew: MoneyCrew | null;
  readonly trips: readonly MoneyTrip[];
  readonly trip: MoneyTrip | null;
  /** Everyone the crew has had, in join order. */
  readonly members: readonly MoneyMember[];
  /** Who a new expense splits between by default. */
  readonly splitMembers: readonly MoneyMember[];
}

export function useMoneyContext(requestedTripId: string | null = null): MoneyContext {
  const locale = useLocale();
  const uidRows = useLiveRows<{ value: string }>(UID_SQL, [OWNER_UID_KEY], UID_TABLES);
  const uid = uidRows.rows[0]?.value ?? null;
  const profile = useLiveRows<ProfileRow>(PROFILE_SQL, uid === null ? null : [uid], PROFILE_TABLES);
  const crews = useLiveRows<CrewRow>(CREWS_SQL, uid === null ? null : [uid], CREWS_TABLES);
  const me = profile.rows[0] ?? null;
  const crewRow = pickCrew(crews.rows, me?.active_crew_id ?? null);
  const crewId = crewRow?.id ?? null;
  const members = useLiveRows<MemberRow>(
    MEMBERS_SQL,
    crewId === null ? null : [crewId],
    MEMBERS_TABLES,
  );
  const trips = useLiveRows<TripRow>(
    TRIPS_SQL,
    uid === null || crewId === null ? null : [uid, crewId],
    TRIPS_TABLES,
  );
  const tripRow = pickTrip(trips.rows, requestedTripId);
  const participants = useLiveRows<{ user_id: string }>(
    PARTICIPANTS_SQL,
    tripRow === null ? null : [tripRow.id],
    PARTICIPANTS_TABLES,
  );
  useTripStreams(tripRow?.id ?? null);

  return useMemo(() => {
    const memberList = toMembers(members.rows);
    const crew: MoneyCrew | null =
      crewRow === null
        ? null
        : {
            id: crewRow.id,
            name: crewRow.name ?? '',
            settlementCurrency: crewCurrencyOf(crewRow, me?.home_currency),
            organiser: crewRow.role === 'organiser',
          };
    const tripList = trips.rows.map((row) => toTrip(row, crewRow));
    const trip = tripRow === null ? null : toTrip(tripRow, crewRow);
    const loaded = uid !== null && crews.loaded && (crewId === null || trips.loaded);
    const status: MoneyContext['status'] = !loaded
      ? 'loading'
      : crew === null
        ? 'no_crew'
        : trip === null
          ? 'no_trip'
          : 'ready';
    return {
      status,
      uid,
      locale,
      homeCurrency: me?.home_currency ?? null,
      homeCountry: toCountryCode(me?.home_country),
      crew,
      trips: tripList,
      trip,
      members: memberList,
      splitMembers: splitMembers(
        memberList,
        participants.rows.map((row) => row.user_id),
      ),
    };
  }, [
    locale,
    uid,
    me,
    crewRow,
    crewId,
    crews.loaded,
    trips.loaded,
    trips.rows,
    tripRow,
    members.rows,
    participants.rows,
  ]);
}
