/**
 * A boosted crew trip in its trip days (Asia/Makassar) with three sharing members and a meet-up
 * at Campuhan Ridge, built through the owner connection so fix times can be back-dated.
 */
import { randomUUID } from 'node:crypto';

import type pg from 'pg';

export const TRIP_TZ = 'Asia/Makassar';
export const MEETUP = { lat: -8.5031, lng: 115.2544 };

const TO_IN_TRIP = [
  'won',
  'setup',
  'drafting',
  'draft_review',
  'proposed',
  'confirmed',
  'pre_trip',
  'in_trip',
];

export function localDate(tz: string, offsetDays: number, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(
    new Date(now.getTime() + offsetDays * 86_400_000),
  );
}

export interface CrewTrip {
  readonly tripId: string;
  readonly crewId: string;
  /** Maya, Rin, Jordan: participants, in that order. */
  readonly uids: readonly [string, string, string];
  readonly outsider: string;
}

export async function buildCrewTrip(pool: pg.Pool, options: { daysLeft?: number } = {}) {
  const uids = [randomUUID(), randomUUID(), randomUUID()] as const;
  const outsider = randomUUID();
  const names = ['Maya', 'Rin', 'Jordan'];
  for (const [index, uid] of uids.entries()) {
    await pool.query("INSERT INTO users (id, status, display_name) VALUES ($1, 'registered', $2)", [
      uid,
      names[index],
    ]);
  }
  await pool.query("INSERT INTO users (id, status) VALUES ($1, 'registered')", [outsider]);
  const crew = await pool.query<{ id: string }>(
    "INSERT INTO crews (name, created_by) VALUES ('The Bali Six', $1) RETURNING id",
    [uids[0]],
  );
  const crewId = crew.rows[0]!.id;
  for (const uid of uids) {
    await pool.query(
      "INSERT INTO crew_members (crew_id, user_id, role) VALUES ($1, $2, 'member')",
      [crewId, uid],
    );
  }
  const trip = await pool.query<{ id: string }>(
    "INSERT INTO trips (crew_id, status) VALUES ($1, 'voting') RETURNING id",
    [crewId],
  );
  const tripId = trip.rows[0]!.id;
  for (const uid of uids) {
    await pool.query(
      "INSERT INTO trip_participants (trip_id, user_id, role, rsvp) VALUES ($1, $2, 'member', 'in')",
      [tripId, uid],
    );
  }
  await pool.query('UPDATE trips SET tz = $2, start_date = $3, end_date = $4 WHERE id = $1', [
    tripId,
    TRIP_TZ,
    localDate(TRIP_TZ, -1),
    localDate(TRIP_TZ, options.daysLeft ?? 1),
  ]);
  for (const status of TO_IN_TRIP) {
    await pool.query('UPDATE trips SET status = $2 WHERE id = $1', [tripId, status]);
  }
  await pool.query(
    'INSERT INTO trip_entitlements (trip_id, boost_active, live_map) VALUES ($1, true, true)',
    [tripId],
  );
  return { tripId, crewId, uids, outsider } satisfies CrewTrip;
}

export async function openShare(
  pool: pg.Pool,
  tripId: string,
  uid: string,
  options: { paused?: boolean; endsAt?: Date } = {},
): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO location_shares (trip_id, user_id, reason, starts_at, ends_at, paused)
     VALUES ($1, $2, 'crew_map',
             least(now(), coalesce($4::timestamptz, now())) - interval '10 minutes',
             coalesce($4::timestamptz, app.crew_map_window_end($1)), $3)
     RETURNING id`,
    [tripId, uid, options.paused ?? false, options.endsAt?.toISOString() ?? null],
  );
  return rows[0]!.id;
}

export async function addFix(
  pool: pg.Pool,
  shareId: string,
  fix: { lat: number; lng: number; activity?: string; at?: Date },
): Promise<void> {
  await pool.query(
    `INSERT INTO location_fixes (user_id, trip_id, share_id, lat, lng, accuracy_m, activity, at)
     SELECT user_id, trip_id, id, $2, $3, 8, $4, $5 FROM location_shares WHERE id = $1`,
    [shareId, fix.lat, fix.lng, fix.activity ?? 'walking', (fix.at ?? new Date()).toISOString()],
  );
}

export async function addMeetup(pool: pg.Pool, tripId: string, by: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO meetups (trip_id, place_name, lat, lng, meet_at, created_by)
     VALUES ($1, 'Campuhan Ridge', $2, $3, now() + interval '1 hour', $4) RETURNING id`,
    [tripId, MEETUP.lat, MEETUP.lng, by],
  );
  return rows[0]!.id;
}
