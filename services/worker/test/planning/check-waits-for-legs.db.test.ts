/**
 * The plan check and the stored legs agree on order and on what a stop is, on the real schema:
 * a version whose legs are not stored yet is not checked (no clash from a straight-line guess),
 * it is checked once they are, and a version whose legs never came is checked on what it has; a
 * visit to a place the catalogue files as a stay is a stop with legs like any other, and only an
 * item that is itself the stay anchors the night.
 */
import { randomUUID } from 'node:crypto';

import { createPlanningTravel } from '@cp/suppliers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runPlanCheck } from '../../src/jobs/planning/check';
import { refreshTripLegs } from '../../src/jobs/planning/legs/job';
import { insertCrew, insertUser, startNotifyDb, type NotifyDb } from '../notify-fixtures';

let db: NotifyDb;
let destinationId: string;
let people: string[];
const poi = { cafe: '', villa: '', hotel: '', lake: '' };
const dalat = (time: string) => new Date(`2026-10-20T${time}:00+07:00`);

async function one(sql: string, values: unknown[]): Promise<string> {
  const { rows } = await db.pool.query<{ id: string }>(sql, values);
  const id = rows[0]?.id;
  if (id === undefined) throw new Error(`no row from ${sql}`);
  return id;
}

interface Seeded {
  readonly tripId: string;
  readonly versionId: string;
  readonly dayId: string;
}

async function seedTrip(): Promise<Seeded> {
  const crewId = await insertCrew(db.pool, people);
  const tripId = await one(
    `INSERT INTO trips (crew_id, status, destination_id, tz)
     VALUES ($1, 'setup', $2, 'Asia/Ho_Chi_Minh') RETURNING id`,
    [crewId, destinationId],
  );
  const versionId = await one(
    `INSERT INTO itinerary_versions (trip_id, visibility, status) VALUES ($1, 'crew', 'current')
     RETURNING id`,
    [tripId],
  );
  const dayId = await one(
    `INSERT INTO plan_days (version_id, trip_id, day_no, date) VALUES ($1, $2, 1, '2026-10-20')
     RETURNING id`,
    [versionId, tripId],
  );
  await db.pool.query('UPDATE trips SET current_version_id = $2 WHERE id = $1', [
    tripId,
    versionId,
  ]);
  return { tripId, versionId, dayId };
}

async function addItem(
  trip: Seeded,
  poiId: string,
  category: string | null,
  from: string,
  to: string,
): Promise<string> {
  const stable = randomUUID();
  await db.pool.query(
    `INSERT INTO plan_items (version_id, day_id, trip_id, stable_id, starts_at, ends_at, tz,
       poi_id, category)
     VALUES ($1, $2, $3, $4, $5, $6, 'Asia/Ho_Chi_Minh', $7, $8)`,
    [trip.versionId, trip.dayId, trip.tripId, stable, dalat(from), dalat(to), poiId, category],
  );
  return stable;
}

async function pairsOf(versionId: string): Promise<string[]> {
  const { rows } = await db.pool.query<{ pair: string }>(
    `SELECT from_key || '>' || to_key AS pair FROM plan_legs WHERE version_id = $1 ORDER BY 1`,
    [versionId],
  );
  return rows.map((row) => row.pair);
}

const check = (tripId: string) =>
  runPlanCheck(db.pool, { trip_id: tripId, trigger: 'plan' }, new Date());

beforeAll(async () => {
  db = await startNotifyDb();
  people = [await insertUser(db.pool), await insertUser(db.pool)];
  destinationId = await one(
    `INSERT INTO destinations (slug, name, coverage, tz)
     VALUES ('da-lat', 'Đà Lạt', 'live', 'Asia/Ho_Chi_Minh') RETURNING id`,
    [],
  );
  const place = (name: string, category: string, lat: number, lng: number) =>
    one(
      `INSERT INTO pois (destination_id, name, category, lat, lng) VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [destinationId, name, category, lat, lng],
    );
  poi.cafe = await place('Bánh Căn Nhà Chung', 'food', 11.9367, 108.4375);
  poi.villa = await place('The Crazy House', 'stay', 11.9347, 108.4306);
  poi.hotel = await place('Ana Mandara Villas', 'stay', 11.9459, 108.4226);
  poi.lake = await place('Hồ Tuyền Lâm', 'nature', 11.8912, 108.4257);
}, 240_000);

afterAll(async () => {
  await db?.stop();
});

describe('the check waits for the legs', () => {
  it('does not check a fresh version on guesses, and checks it once its legs are stored', async () => {
    const trip = await seedTrip();
    // 25 minutes between the two: enough on the stored 12-minute drive, not on a longer guess.
    const cafe = await addItem(trip, poi.cafe, 'meal', '08:00', '09:00');
    const lake = await addItem(trip, poi.lake, 'activity', '09:25', '11:00');

    expect(await check(trip.tripId)).toEqual({ outcome: 'skipped', reason: 'legs_pending' });
    const none = await db.pool.query('SELECT 1 FROM plan_checks WHERE trip_id = $1', [trip.tripId]);
    expect(none.rowCount).toBe(0);

    await db.pool.query(
      `INSERT INTO plan_legs (trip_id, version_id, day_id, from_key, to_key, mode, minutes, meters,
                              source, approx)
       VALUES ($1, $2, $3, $4, $5, 'drive', 12, 7400, 'valhalla', false)`,
      [trip.tripId, trip.versionId, trip.dayId, cafe, lake],
    );
    expect(await check(trip.tripId)).toMatchObject({ outcome: 'checked', fix: 0 });

    // The same plan with a leg that says the drive is longer than the time between them.
    await db.pool.query('UPDATE plan_legs SET minutes = 40 WHERE version_id = $1', [
      trip.versionId,
    ]);
    expect(await check(trip.tripId)).toMatchObject({ outcome: 'checked', fix: 1 });
  });

  it('checks a version whose legs never came on what it has', async () => {
    const trip = await seedTrip();
    await addItem(trip, poi.cafe, 'meal', '08:00', '09:00');
    await addItem(trip, poi.lake, 'activity', '09:02', '11:00');
    expect(await check(trip.tripId)).toMatchObject({ outcome: 'skipped' });
    await db.pool.query(
      "UPDATE itinerary_versions SET created_at = now() - interval '10 minutes' WHERE id = $1",
      [trip.versionId],
    );
    expect(await check(trip.tripId)).toMatchObject({ outcome: 'checked', fix: 1 });
  });
});

describe('a visit to a place filed as a stay', () => {
  it('is a stop with legs, and does not become the night’s stay', async () => {
    const trip = await seedTrip();
    const cafe = await addItem(trip, poi.cafe, 'meal', '08:00', '09:00');
    const villa = await addItem(trip, poi.villa, 'activity', '10:00', '11:30');
    const travel = createPlanningTravel({ valhalla: null });

    await refreshTripLegs(db.pool, travel, trip.tripId);
    expect(await pairsOf(trip.versionId)).toEqual([`${cafe}>${villa}`]);

    // With the crew's own stay on the plan, the day starts and ends there, the visit in between.
    await addItem(trip, poi.hotel, 'stay', '14:00', '15:00');
    await refreshTripLegs(db.pool, travel, trip.tripId);
    expect(await pairsOf(trip.versionId)).toEqual(
      [`stay>${cafe}`, `${cafe}>${villa}`, `${villa}>stay`].sort(),
    );
    const { rows } = await db.pool.query<{ meters: number }>(
      `SELECT meters FROM plan_legs WHERE version_id = $1 AND from_key = $2 AND to_key = 'stay'`,
      [trip.versionId, villa],
    );
    // Measured to the hotel across town, not to the villa itself.
    expect(rows[0]?.meters).toBeGreaterThan(800);

    // The check counts the visit as a stop too: it clashes with a meal put on top of it.
    await addItem(trip, poi.cafe, 'meal', '10:30', '11:00');
    await refreshTripLegs(db.pool, travel, trip.tripId);
    expect(await check(trip.tripId)).toMatchObject({ outcome: 'checked', fix: 1 });
  });
});
