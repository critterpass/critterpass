/**
 * A crew on a trip in its trip days (Asia/Makassar, last day tomorrow) with a catalogue place:
 * two travellers on the trip, a crew member who is not, and an outsider. Boost is set per suite.
 */
import { randomUUID } from 'node:crypto';

import { withSystem } from '@cp/db';
import type pg from 'pg';

import type { CommandDoorsHarness, SignedIn } from '../routes/command-doors-harness';

export const TRIP_TZ = 'Asia/Makassar';

export interface LiveMapFixture {
  readonly maya: SignedIn;
  readonly rin: SignedIn;
  readonly bystander: SignedIn;
  readonly outsider: SignedIn;
  readonly tripId: string;
  readonly poiId: string;
}

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

export function localDate(tz: string, offsetDays: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(
    new Date(Date.now() + offsetDays * 86_400_000),
  );
}

export async function intoTripDays(tx: pg.PoolClient, tripId: string, daysLeft = 1): Promise<void> {
  await tx.query('UPDATE trips SET tz = $2, start_date = $3, end_date = $4 WHERE id = $1', [
    tripId,
    TRIP_TZ,
    localDate(TRIP_TZ, -1),
    localDate(TRIP_TZ, daysLeft),
  ]);
  for (const status of TO_IN_TRIP) {
    await tx.query('UPDATE trips SET status = $2 WHERE id = $1', [tripId, status]);
  }
}

export async function setBoost(pool: pg.Pool, tripId: string, active: boolean): Promise<void> {
  await withSystem(pool, (tx) =>
    tx.query(
      `INSERT INTO trip_entitlements (trip_id, boost_active, live_map) VALUES ($1, $2, $2)
       ON CONFLICT (trip_id) DO UPDATE SET boost_active = $2, live_map = $2`,
      [tripId, active],
    ),
  );
}

export async function buildLiveMapFixture(
  harness: CommandDoorsHarness,
  options: { readonly inTripDays?: boolean } = {},
): Promise<LiveMapFixture> {
  const [maya, rin, bystander, outsider] = await Promise.all([
    harness.signInAnonymously(),
    harness.signInAnonymously(),
    harness.signInAnonymously(),
    harness.signInAnonymously(),
  ]);
  const ids = await withSystem(harness.pool, async (tx) => {
    const slug = `ubud-${randomUUID().slice(0, 8)}`;
    const dest = await tx.query<{ id: string }>(
      "INSERT INTO destinations (slug, name) VALUES ($1, 'Ubud') RETURNING id",
      [slug],
    );
    const crew = await tx.query<{ id: string }>(
      "INSERT INTO crews (name, created_by) VALUES ('The Bali Six', $1) RETURNING id",
      [maya.uid],
    );
    const crewId = crew.rows[0]!.id;
    await tx.query(
      `INSERT INTO crew_members (crew_id, user_id, role)
       VALUES ($1, $2, 'organiser'), ($1, $3, 'member'), ($1, $4, 'member')`,
      [crewId, maya.uid, rin.uid, bystander.uid],
    );
    const trip = await tx.query<{ id: string }>(
      "INSERT INTO trips (crew_id, status, destination_id) VALUES ($1, 'voting', $2) RETURNING id",
      [crewId, dest.rows[0]!.id],
    );
    const tripId = trip.rows[0]!.id;
    await tx.query(
      `INSERT INTO trip_participants (trip_id, user_id, role, rsvp)
       VALUES ($1, $2, 'organiser', 'in'), ($1, $3, 'member', 'in')`,
      [tripId, maya.uid, rin.uid],
    );
    if (options.inTripDays !== false) await intoTripDays(tx, tripId);
    const poi = await tx.query<{ id: string }>(
      `INSERT INTO pois (destination_id, name, category, lat, lng)
       VALUES ($1, 'Campuhan Ridge', 'nature', -8.5031, 115.2544) RETURNING id`,
      [dest.rows[0]!.id],
    );
    return { tripId, poiId: poi.rows[0]!.id };
  });
  return { maya, rin, bystander, outsider, ...ids };
}
