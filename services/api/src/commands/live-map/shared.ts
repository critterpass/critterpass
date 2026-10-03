/**
 * What every crew live map command shares: who may act (a participant of the trip, not answered
 * `out` unless organising), the gate (`boostActive(t)` → `ENTITLEMENT_REQUIRED`, then trip days and
 * the window → `NOT_ELIGIBLE`), the realtime hint on `trip_locations:{trip_id}` and the ETA timer.
 */
import { outbox, scheduleEvent } from '@cp/db';
import { crewMapChannel, DomainError, type LiveMapEnvelopeType, type MeetupWire } from '@cp/domain';
import type pg from 'pg';

import { entitle } from '../../entitlements';

export const ETA_MEETUPS_QUEUE = 'eta.meetups';
export const LOCATION_EXPIRE_QUEUE = 'location.expire';

export async function requireTripParticipant(
  tx: pg.PoolClient,
  tripId: string,
  uid: string,
): Promise<void> {
  const { rows } = await tx.query<{ on_trip: boolean }>(
    `SELECT app.is_trip_member($1) AND EXISTS (
       SELECT 1 FROM trip_participants
       WHERE trip_id = $1 AND user_id = $2 AND (rsvp <> 'out' OR role = 'organiser')
     ) AS on_trip`,
    [tripId, uid],
  );
  if (rows[0]?.on_trip !== true) throw new DomainError('NOT_ELIGIBLE', { reason: 'not_on_trip' });
}

/** Boost (or First Trip Free) first, so an unboosted trip always gets the paywall answer. */
export async function requireCrewMapOpen(
  tx: pg.PoolClient,
  tripId: string,
  uid: string,
  deviceTz: string,
): Promise<void> {
  await entitle(tx, { uid, deviceTz }, { kind: 'capability', key: 'boost_active', tripId });
  const { rows } = await tx.query<{ open: boolean }>('SELECT app.crew_map_open($1) AS open', [
    tripId,
  ]);
  if (rows[0]?.open !== true) {
    throw new DomainError('NOT_ELIGIBLE', { reason: 'outside_trip_days' });
  }
}

export function publishLiveMap(
  tx: pg.PoolClient,
  tripId: string,
  type: LiveMapEnvelopeType,
  data: unknown,
): Promise<unknown> {
  return outbox(tx, crewMapChannel(tripId), type, data);
}

/** Arms the meet-up's ETA recount to run at the next minute tick (re-arming collapses). */
export async function armMeetupEtas(
  tx: pg.PoolClient,
  meetupId: string,
  tz: string,
): Promise<void> {
  await scheduleEvent(tx, { kind: ETA_MEETUPS_QUEUE, refId: meetupId, tz, at: new Date() });
}

/** The trip's zone: its own, else its destination's. */
export async function tripZone(tx: pg.PoolClient, tripId: string): Promise<string> {
  const { rows } = await tx.query<{ tz: string | null }>(
    `SELECT coalesce(t.tz, d.tz) AS tz
       FROM trips t LEFT JOIN destinations d ON d.id = t.destination_id WHERE t.id = $1`,
    [tripId],
  );
  return rows[0]?.tz ?? 'UTC';
}

interface MeetupRow {
  id: string;
  trip_id: string;
  poi_id: string | null;
  place_name: string;
  lat: number;
  lng: number;
  meet_at: Date;
  created_by: string;
  status: 'active' | 'done' | 'cancelled';
  arrived: Record<string, string>;
}

export const MEETUP_COLUMNS =
  'id, trip_id, poi_id, place_name, lat, lng, meet_at, created_by, status, arrived';

export function meetupWire(row: MeetupRow): MeetupWire {
  return { ...row, meet_at: row.meet_at.toISOString() };
}

export async function readMeetup(tx: pg.PoolClient, meetupId: string): Promise<MeetupWire | null> {
  const { rows } = await tx.query<MeetupRow>(
    `SELECT ${MEETUP_COLUMNS} FROM meetups WHERE id = $1`,
    [meetupId],
  );
  return rows[0] === undefined ? null : meetupWire(rows[0]);
}

export async function activeMeetup(tx: pg.PoolClient, tripId: string): Promise<MeetupWire | null> {
  const { rows } = await tx.query<MeetupRow>(
    `SELECT ${MEETUP_COLUMNS} FROM meetups WHERE trip_id = $1 AND status = 'active'`,
    [tripId],
  );
  return rows[0] === undefined ? null : meetupWire(rows[0]);
}

export interface ResolvedPlace {
  readonly poiId: string | null;
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
}

/** A catalogue place (its name and position) or a dropped pin with the name the picker gave it. */
export async function resolvePlace(
  tx: pg.PoolClient,
  place: {
    poi_id?: string | undefined;
    point?: { lat: number; lng: number; name: string } | undefined;
  },
): Promise<ResolvedPlace | null> {
  if (place.point !== undefined) {
    return { poiId: null, name: place.point.name, lat: place.point.lat, lng: place.point.lng };
  }
  if (place.poi_id === undefined) return null;
  const { rows } = await tx.query<{ name: string; lat: number; lng: number }>(
    'SELECT name, lat, lng FROM pois WHERE id = $1',
    [place.poi_id],
  );
  const row = rows[0];
  if (row === undefined) throw new DomainError('NOT_FOUND', { reason: 'poi' });
  return { poiId: place.poi_id, name: row.name, lat: row.lat, lng: row.lng };
}

/** The one row a statement must return (a missing row is a bug, not a user error). */
export function firstRow<T>(rows: readonly T[], what: string): T {
  const row = rows[0];
  if (row === undefined) throw new Error(`live map: ${what} returned no row`);
  return row;
}
