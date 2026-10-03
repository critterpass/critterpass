/**
 * The trip's stay on the real schema: a booked crew stay covering the night wins over the plan,
 * two bookings split the nights between them, a planned stay anchors the nights it reaches, a
 * personal booking never anchors crew legs, a trip with nothing has no stay, and place detail
 * answers a time from tonight's stay.
 */
import { randomUUID } from 'node:crypto';

import { runMigrations, withSystem } from '@cp/db';
import { startPostgres, type StartedPostgreSqlContainer } from '@cp/db/testing';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getPlaceDetail } from '../../src/places/detail';
import { tripStay } from '../../src/planning/stay';

let postgres: StartedPostgreSqlContainer;
let pool: pg.Pool;
let owner: string;
let destinationId: string;
const places: Record<'villa' | 'hotel' | 'resort' | 'temple', string> = {
  villa: '',
  hotel: '',
  resort: '',
  temple: '',
};

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
  postgres = await startPostgres();
  pool = new pg.Pool({ connectionString: postgres.getConnectionUri(), max: 4 });
  await runMigrations(pool);
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
  places.temple = await place('Pura Tirta Empul', 'temple_shrine', -8.4153, 115.3154);
}, 240_000);

afterAll(async () => {
  await pool?.end();
  await postgres?.stop();
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

  it('has no stay when nothing places one', async () => {
    const tripId = await newTrip();
    await book(tripId, 'A guesthouse we found', 1, 3);
    await plan(tripId, []);
    expect(await stayOn(tripId, night(1))).toBeNull();
  });
});

describe('place detail from the stay', () => {
  it('answers distance and time from tonight’s stay', async () => {
    const tripId = await newTrip();
    await book(tripId, 'Komaneka Ubud', 1, 4);
    const detail = await withSystem(pool, (tx) =>
      getPlaceDetail(tx, places.temple, { tripId, now: new Date(bali(night(2), 9)) }),
    );
    expect(detail.distanceFromLodgingM).toBeGreaterThan(9_000);
    expect(detail.etaFromLodgingMinutes).toBeGreaterThan(0);
    expect(detail.etaFromLodgingIsEstimate).toBe(true);
  });
});
