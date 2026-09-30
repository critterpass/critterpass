/**
 * `useWalletContext()`: the signed-in member, their crew and its forward address, the trip the
 * wallet shows (the one under way, else the next) with its travellers, and whether the member has
 * Pass+. While a wallet screen is open it holds the trip's sync stream, which carries the trip's
 * bookings, documents and flight legs.
 */
/* eslint-disable lingui/no-unlocalized-strings -- stream names and status values, never copy. */
import { useEffect, useMemo } from 'react';

import { useLocalFirst } from '@/data/powersync/local-first-context';
import { OWNER_UID_KEY } from '@/data/powersync/local-tables';

import { useLiveRows } from './live-rows';
import {
  CREWS_SQL,
  CREWS_TABLES,
  INBOUND_SQL,
  INBOUND_TABLES,
  MEMBERS_SQL,
  MEMBERS_TABLES,
  PARTICIPANTS_SQL,
  PARTICIPANTS_TABLES,
  PASS_PLUS_SQL,
  PASS_PLUS_TABLES,
  PROFILE_SQL,
  PROFILE_TABLES,
  TRIPS_SQL,
  TRIPS_TABLES,
  UID_SQL,
  UID_TABLES,
  type CrewRow,
  type MemberRow,
  type TripRow,
} from './queries';

export const INBOUND_DOMAIN = 'in.critterpass.app';

export interface WalletMember {
  readonly userId: string;
  readonly name: string;
}

export interface WalletContext {
  readonly status: 'loading' | 'no_crew' | 'no_trip' | 'ready';
  readonly uid: string | null;
  readonly crewId: string | null;
  readonly crewCurrency: string;
  readonly trip: TripRow | null;
  readonly members: readonly WalletMember[];
  /** Trip travellers holding a seat, in join order. */
  readonly travellerIds: readonly string[];
  /** `{crew-slug}@in.critterpass.app`, once the crew's address has synced. */
  readonly inboundAddress: string | null;
  readonly passPlus: boolean;
}

const TRIP_STREAM_TTL_S = 60 * 60 * 24;
const UNDER_WAY = new Set(['in_trip']);
const ENDED = new Set(['post_trip', 'archived']);

export function firstName(name: string | null | undefined): string {
  return name?.trim().split(/\s+/u)[0] ?? '';
}

/** The trip under way, else the next one ahead, else the latest that ended. */
export function pickTrip(trips: readonly TripRow[]): TripRow | null {
  const underWay = trips.find((trip) => UNDER_WAY.has(trip.status));
  if (underWay !== undefined) return underWay;
  const ahead = trips
    .filter((trip) => !ENDED.has(trip.status))
    .sort((a, b) => (a.start_date ?? '9999').localeCompare(b.start_date ?? '9999'));
  return ahead[0] ?? trips.find((trip) => ENDED.has(trip.status)) ?? null;
}

function useTripStream(tripId: string | null): void {
  const { db } = useLocalFirst();
  useEffect(() => {
    if (tripId === null) return undefined;
    let released = false;
    let unsubscribe: (() => void) | null = null;
    db.syncStream('trip', { trip_id: tripId })
      .subscribe({ ttl: TRIP_STREAM_TTL_S })
      .then(
        (subscription) => {
          if (released) subscription.unsubscribe();
          else unsubscribe = () => subscription.unsubscribe();
        },
        () => undefined,
      );
    return () => {
      released = true;
      unsubscribe?.();
    };
  }, [db, tripId]);
}

export function useWalletContext(): WalletContext {
  const uidRows = useLiveRows<{ value: string }>(UID_SQL, [OWNER_UID_KEY], UID_TABLES);
  const uid = uidRows.rows[0]?.value ?? null;
  const byUid = uid === null ? null : [uid];
  const profile = useLiveRows<{ active_crew_id: string | null; home_currency: string | null }>(
    PROFILE_SQL,
    byUid,
    PROFILE_TABLES,
  );
  const crews = useLiveRows<CrewRow>(CREWS_SQL, byUid, CREWS_TABLES);
  const me = profile.rows[0] ?? null;
  const crew = crews.rows.find((row) => row.id === me?.active_crew_id) ?? crews.rows[0] ?? null;
  const byCrew = crew === null ? null : [crew.id];
  const members = useLiveRows<MemberRow>(MEMBERS_SQL, byCrew, MEMBERS_TABLES);
  const trips = useLiveRows<TripRow>(TRIPS_SQL, byCrew, TRIPS_TABLES);
  const inbound = useLiveRows<{ local_part: string }>(INBOUND_SQL, byCrew, INBOUND_TABLES);
  const passPlus = useLiveRows<{ pass_plus: number }>(PASS_PLUS_SQL, byUid, PASS_PLUS_TABLES);
  const trip = pickTrip(trips.rows);
  const participants = useLiveRows<{ user_id: string }>(
    PARTICIPANTS_SQL,
    trip === null ? null : [trip.id],
    PARTICIPANTS_TABLES,
  );
  useTripStream(trip?.id ?? null);

  return useMemo(() => {
    const loaded = uid !== null && crews.loaded && (crew === null || trips.loaded);
    const localPart = inbound.rows[0]?.local_part ?? null;
    return {
      status: !loaded ? 'loading' : crew === null ? 'no_crew' : trip === null ? 'no_trip' : 'ready',
      uid,
      crewId: crew?.id ?? null,
      crewCurrency: crew?.settlement_currency ?? me?.home_currency ?? 'USD',
      trip,
      members: members.rows.map((row) => ({
        userId: row.user_id,
        name: firstName(row.display_name),
      })),
      travellerIds: participants.rows.map((row) => row.user_id),
      inboundAddress: localPart === null ? null : `${localPart}@${INBOUND_DOMAIN}`,
      passPlus: (passPlus.rows[0]?.pass_plus ?? 0) === 1,
    };
  }, [
    uid,
    crews.loaded,
    crew,
    trips.loaded,
    trip,
    me,
    members.rows,
    participants.rows,
    inbound.rows,
    passPlus.rows,
  ]);
}
