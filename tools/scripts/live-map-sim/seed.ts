/**
 * Seeds a crew live map scenario through the owner connection: a crew "The Bali Six" with the given
 * members, one boosted trip in its trip days in Ubud (Asia/Makassar) with the Campuhan Ridge
 * place, and one unboosted trip in its trip days for the gate. The first uid organises both.
 */
import { randomUUID } from 'node:crypto';

import type pg from 'pg';

import { CAMPUHAN_RIDGE } from './routes';

export const SIM_TZ = 'Asia/Makassar';

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

function idOf(rows: readonly { id: string }[]): string {
  const id = rows[0]?.id;
  if (id === undefined) throw new Error('insert returned no row');
  return id;
}

function localDate(offsetDays: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: SIM_TZ }).format(
    new Date(Date.now() + offsetDays * 86_400_000),
  );
}

export interface SeededCrew {
  readonly crewId: string;
  readonly boostedTripId: string;
  readonly unboostedTripId: string;
  readonly poiId: string;
}

async function tripInTripDays(
  client: pg.Pool | pg.PoolClient,
  crewId: string,
  destinationId: string,
  uids: readonly string[],
  boosted: boolean,
): Promise<string> {
  const { rows } = await client.query<{ id: string }>(
    "INSERT INTO trips (crew_id, status, destination_id) VALUES ($1, 'voting', $2) RETURNING id",
    [crewId, destinationId],
  );
  const tripId = idOf(rows);
  for (const [index, uid] of uids.entries()) {
    await client.query(
      "INSERT INTO trip_participants (trip_id, user_id, role, rsvp) VALUES ($1, $2, $3, 'in')",
      [tripId, uid, index === 0 ? 'organiser' : 'member'],
    );
  }
  await client.query('UPDATE trips SET tz = $2, start_date = $3, end_date = $4 WHERE id = $1', [
    tripId,
    SIM_TZ,
    localDate(-2),
    localDate(2),
  ]);
  for (const status of TO_IN_TRIP) {
    await client.query('UPDATE trips SET status = $2 WHERE id = $1', [tripId, status]);
  }
  await client.query(
    `INSERT INTO trip_entitlements (trip_id, boost_active, live_map) VALUES ($1, $2, $2)
     ON CONFLICT (trip_id) DO UPDATE SET boost_active = $2, live_map = $2`,
    [tripId, boosted],
  );
  return tripId;
}

/** `uids` must already exist (signed in); names are set as display names in order. */
export async function seedLiveMapCrew(
  pool: pg.Pool,
  members: readonly { readonly uid: string; readonly name: string }[],
): Promise<SeededCrew> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const member of members) {
      await client.query('UPDATE users SET display_name = $2 WHERE id = $1', [
        member.uid,
        member.name,
      ]);
    }
    const uids = members.map((member) => member.uid);
    const dest = await client.query<{ id: string }>(
      "INSERT INTO destinations (slug, name) VALUES ($1, 'Ubud') RETURNING id",
      [`ubud-sim-${randomUUID().slice(0, 8)}`],
    );
    const destinationId = idOf(dest.rows);
    const crew = await client.query<{ id: string }>(
      "INSERT INTO crews (name, created_by) VALUES ('The Bali Six', $1) RETURNING id",
      [uids[0]],
    );
    const crewId = idOf(crew.rows);
    for (const [index, uid] of uids.entries()) {
      await client.query('INSERT INTO crew_members (crew_id, user_id, role) VALUES ($1, $2, $3)', [
        crewId,
        uid,
        index === 0 ? 'organiser' : 'member',
      ]);
    }
    const poi = await client.query<{ id: string }>(
      `INSERT INTO pois (destination_id, name, category, lat, lng)
       VALUES ($1, $2, 'nature', $3, $4) RETURNING id`,
      [destinationId, CAMPUHAN_RIDGE.name, CAMPUHAN_RIDGE.lat, CAMPUHAN_RIDGE.lng],
    );
    await client.query(
      `INSERT INTO pois (destination_id, name, category, lat, lng)
       VALUES ($1, 'Karsa Spa', 'health', -8.4915, 115.253),
              ($1, 'Warung Pondok', 'food', -8.5069, 115.2625)`,
      [destinationId],
    );
    const boostedTripId = await tripInTripDays(client, crewId, destinationId, uids, true);
    const unboostedTripId = await tripInTripDays(client, crewId, destinationId, uids, false);
    await client.query('COMMIT');
    return { crewId, boostedTripId, unboostedTripId, poiId: idOf(poi.rows) };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
