/**
 * The trip's stay on the real schema: a booked crew stay covering the night wins over the plan,
 * two bookings split the nights between them, a planned stay anchors the nights it reaches, a
 * personal booking never anchors crew legs, a visit to a place the catalogue files as a stay is
 * not where the crew sleeps, and a trip with nothing has no stay.
 */
import { randomUUID } from 'node:crypto';

import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { tripStay } from '../src/planning/stay';
import { withSystem } from '../src/tx';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from './helpers/pg-container';

let container: DbTestContainer;
let db: DbTestDatabase;
let pool: pg.Pool;
let owner: string;
let destinationId: string;
const places: Record<'villa' | 'hotel' | 'resort', string> = { villa: '', hotel: '', resort: '' };

/** Night `n` of the trip (2026-11-01 is night 1), as a `YYYY-MM-DD` day in Bali. */
const night = (n: number) => `2026-11-${String(n).padStart(2, '0')}`;
const bali = (date: string, hour: number) => `${date}T${String(hour).padStart(2, '0')}:00:00+08:00`;

async function one<T>(sql: string, values: unknown[]): Promise<T> {
  const { rows } = await pool.query<{ id: T }>(sql, values);
  const id = rows[0]?.id;
  if (id === undefined) throw new Error(`no row from ${sql}`);
  return id;
}

async function newTrip(): Promise<string> {
  const crew = await one<string>(
    'INSERT INTO crews (name, created_by) VALUES ($1, $2) RETURNING id',
    ['Bali', owner],
  );
  return one<string>(
    `INSERT INTO trips (crew_id, status, destination_id) VALUES ($1, 'setup', $2) RETURNING id`,
    [crew, destinationId],
  );
}

/** A current plan with four days; `stays` puts a stay place on a day (1-based). */
async function plan(tripId: string, stays: [day: number, poiId: string][], bookingId?: string) {
  const version = await one<string>(
    `INSERT INTO itinerary_versions (trip_id, visibility, status) VALUES ($1, 'crew', 'current')
     RETURNING id`,
    [tripId],
  );
  const days: string[] = [];
  for (let n = 1; n <= 4; n += 1) {
    days.push(
      await one<string>(
        `INSERT INTO plan_days (version_id, trip_id, day_no, date) VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [version, tripId, n, night(n)],
      ),
    );
  }
  for (const [day, poiId] of stays) {
    await pool.query(
      `INSERT INTO plan_items (version_id, day_id, trip_id, stable_id, starts_at, ends_at, tz,
         poi_id, category, booking_id)
       VALUES ($1, $2, $3, $4, $5, $6, 'Asia/Makassar', $7, 'stay', $8)`,
      [
        version,
        days[day - 1],
        tripId,
        randomUUID(),
        bali(night(day), 15),
        bali(night(day), 16),
        poiId,
        bookingId ?? null,
      ],
    );
  }
  await pool.query('UPDATE trips SET current_version_id = $2 WHERE id = $1', [tripId, version]);
}

async function book(
  tripId: string,
  title: string,
  checkIn: number,
  checkOut: number,
  visibility: 'crew' | 'personal' = 'crew',
): Promise<string> {
  return one<string>(
    `INSERT INTO bookings (trip_id, owner_id, type, title, starts_at, ends_at, tz, visibility)
     VALUES ($1, $2, 'stay', $3, $4, $5, 'Asia/Makassar', $6) RETURNING id`,
    [tripId, owner, title, bali(night(checkIn), 14), bali(night(checkOut), 11), visibility],
  );
}

const stayOn = (tripId: string, date?: string) =>
  withSystem(pool, (tx) => tripStay(tx, tripId, date));

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  pool = db.pool;
  owner = randomUUID();
  await pool.query("INSERT INTO users (id, status) VALUES ($1, 'registered')", [owner]);
  destinationId = await one<string>(
    `INSERT INTO destinations (slug, name, coverage, tz) VALUES ('bali', 'Bali', 'live', 'Asia/Makassar')
     RETURNING id`,
    [],
  );
  const place = (name: string, category: string, lat: number, lng: number) =>
    one<string>(
      `INSERT INTO pois (destination_id, name, category, lat, lng) VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [destinationId, name, category, lat, lng],
    );
  places.villa = await place('Villa Lumbung', 'stay', -8.6913, 115.1682);
  places.hotel = await place('Komaneka Ubud', 'stay', -8.5069, 115.2625);
  places.resort = await place('Alila Uluwatu', 'stay', -8.8291, 115.0849);
}, 240_000);

afterAll(async () => {
  await db?.drop();
  await container?.stop();
});

describe('tripStay', () => {
  it('takes the booked stay covering the night over the plan', async () => {
    const tripId = await newTrip();
    await book(tripId, 'villa lumbung', 1, 4);
    await plan(tripId, [[1, places.hotel]]);
    expect(await stayOn(tripId, night(2))).toMatchObject({
      poiId: places.villa,
      name: 'Villa Lumbung',
      source: 'booking',
    });
  });

  it('splits the nights between two bookings, placing one by its plan item', async () => {
    const tripId = await newTrip();
    await book(tripId, 'Villa Lumbung', 1, 3);
    const second = await book(tripId, 'Our clifftop place', 3, 5);
    await plan(tripId, [[3, places.resort]], second);
    expect((await stayOn(tripId, night(1)))?.poiId).toBe(places.villa);
    expect((await stayOn(tripId, night(2)))?.poiId).toBe(places.villa);
    expect((await stayOn(tripId, night(3)))?.poiId).toBe(places.resort);
    expect((await stayOn(tripId))?.poiId).toBe(places.villa);
  });

  it('anchors nights on the planned stays, ignoring a personal booking', async () => {
    const tripId = await newTrip();
    await book(tripId, 'Alila Uluwatu', 1, 5, 'personal');
    await plan(tripId, [
      [2, places.hotel],
      [4, places.villa],
    ]);
    expect(await stayOn(tripId, night(1))).toMatchObject({ poiId: places.hotel, source: 'plan' });
    expect((await stayOn(tripId, night(3)))?.poiId).toBe(places.hotel);
    expect((await stayOn(tripId, night(4)))?.poiId).toBe(places.villa);
  });

  it('does not take a visit to a place filed as a stay for the night’s stay', async () => {
    const tripId = await newTrip();
    await plan(tripId, [[2, places.hotel]]);
    // An afternoon at a famous villa the catalogue files as a stay: a stop, not where they sleep.
    await pool.query(
      `INSERT INTO plan_items (version_id, day_id, trip_id, stable_id, starts_at, ends_at, tz,
         poi_id, category)
       SELECT d.version_id, d.id, d.trip_id, $2, $3, $4, 'Asia/Makassar', $5, 'activity'
         FROM plan_days d JOIN trips t ON t.current_version_id = d.version_id
        WHERE t.id = $1 AND d.day_no = 3`,
      [tripId, randomUUID(), bali(night(3), 10), bali(night(3), 12), places.resort],
    );
    expect((await stayOn(tripId, night(3)))?.poiId).toBe(places.hotel);
    expect((await stayOn(tripId, night(4)))?.poiId).toBe(places.hotel);
  });

  it('has no stay when nothing places one', async () => {
    const tripId = await newTrip();
    await book(tripId, 'A guesthouse we found', 1, 3);
    await plan(tripId, []);
    expect(await stayOn(tripId, night(1))).toBeNull();
  });

  it("anchors the second stop's nights on a stay booked in that stop's city", async () => {
    const tripId = await newTrip();
    const lombok = await one<string>(
      `INSERT INTO destinations (slug, name, coverage, tz)
       VALUES ('stay-lombok', 'Lombok', 'guest', 'Asia/Makassar') RETURNING id`,
      [],
    );
    const lodge = await one<string>(
      `INSERT INTO pois (destination_id, name, category, lat, lng)
       VALUES ($1, 'Sempiak Villas', 'stay', -8.9, 116.2) RETURNING id`,
      [lombok],
    );
    await book(tripId, 'Villa Lumbung', 1, 3);
    await book(tripId, 'Sempiak Villas', 3, 5);
    await plan(tripId, []);
    // Before Lombok is a stop of the trip, its villa is nobody's stay.
    expect((await stayOn(tripId, night(3)))?.poiId).toBe(places.villa);
    await pool.query(
      `INSERT INTO trip_stops (trip_id, crew_id, position, destination_id, nights)
       SELECT id, crew_id, s.position, s.destination_id, 2
         FROM trips, (VALUES (1, $2::uuid), (2, $3::uuid)) AS s(position, destination_id)
        WHERE id = $1`,
      [tripId, destinationId, lombok],
    );
    expect((await stayOn(tripId, night(2)))?.poiId).toBe(places.villa);
    expect((await stayOn(tripId, night(3)))?.poiId).toBe(lodge);
    expect((await stayOn(tripId, night(4)))?.poiId).toBe(lodge);
  });
});
