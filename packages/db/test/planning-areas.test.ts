/**
 * The areas of a trip on the real schema: a trip with no stop rows is its destination on every
 * day; two stops split the days by their nights; a day trip names its area and its link, or no
 * link once the link is gone; a draft's day areas count only when drafts are asked for; and the
 * pure day rule and the SQL set agree.
 */
import { randomUUID } from 'node:crypto';

import { stopIndexOfDay } from '@cp/domain';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { dayArea, tripAreaIds, tripAreas } from '../src/planning/areas';
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
const place: Record<'daNang' | 'hue' | 'hoiAn' | 'myson', string> = {
  daNang: '',
  hue: '',
  hoiAn: '',
  myson: '',
};
const SOURCES = JSON.stringify([{ url: 'https://example.org/hue', title: 'Huế', quote: '2 h' }]);

async function one(sql: string, values: unknown[] = []): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(sql, values);
  const id = rows[0]?.id;
  if (id === undefined) throw new Error(`no row from ${sql}`);
  return id;
}

/** A five-day trip to Đà Nẵng with a crew plan (and, when asked, an organiser draft). */
async function newTrip(): Promise<{ tripId: string; crewId: string; versionId: string }> {
  const crewId = await one('INSERT INTO crews (name, created_by) VALUES ($1, $2) RETURNING id', [
    'Central coast',
    owner,
  ]);
  const tripId = await one(
    `INSERT INTO trips (crew_id, status, destination_id, start_date, end_date)
     VALUES ($1, 'setup', $2, '2026-11-01', '2026-11-05') RETURNING id`,
    [crewId, place.daNang],
  );
  const versionId = await newVersion(tripId, 'crew', 'current');
  await pool.query('UPDATE trips SET current_version_id = $2 WHERE id = $1', [tripId, versionId]);
  return { tripId, crewId, versionId };
}

async function newVersion(tripId: string, visibility: string, status: string): Promise<string> {
  const versionId = await one(
    `INSERT INTO itinerary_versions (trip_id, visibility, status) VALUES ($1, $2, $3)
     RETURNING id`,
    [tripId, visibility, status],
  );
  for (let day = 1; day <= 5; day += 1) {
    await pool.query(
      `INSERT INTO plan_days (version_id, trip_id, day_no, date)
       VALUES ($1, $2, $3::int, '2026-11-01'::date + ($3::int - 1))`,
      [versionId, tripId, day],
    );
  }
  return versionId;
}

const setArea = (versionId: string, dayNo: number, areaId: string | null) =>
  pool.query('UPDATE plan_days SET destination_id = $3 WHERE version_id = $1 AND day_no = $2', [
    versionId,
    dayNo,
    areaId,
  ]);

const stops = (tripId: string, crewId: string, rows: [string, number][]) =>
  pool.query(
    `INSERT INTO trip_stops (trip_id, crew_id, position, destination_id, nights)
     SELECT $1, $2, s.position, s.destination_id, s.nights
       FROM unnest($3::uuid[], $4::int[]) WITH ORDINALITY AS s(destination_id, nights, position)`,
    [tripId, crewId, rows.map(([id]) => id), rows.map(([, nights]) => nights)],
  );

const areasOf = (tripId: string, versionId?: string) =>
  withSystem(pool, (tx) => tripAreas(tx, tripId, versionId));

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  pool = db.pool;
  owner = randomUUID();
  await pool.query("INSERT INTO users (id, status) VALUES ($1, 'registered')", [owner]);
  place.daNang = await one(
    "INSERT INTO destinations (slug, name) VALUES ('areas-da-nang', 'Đà Nẵng') RETURNING id",
  );
  place.hue = await one(
    "INSERT INTO destinations (slug, name) VALUES ('areas-hue', 'Huế') RETURNING id",
  );
  place.hoiAn = await one(
    "INSERT INTO destinations (slug, name, coverage) VALUES ('areas-hoi-an', 'Hội An', 'area') RETURNING id",
  );
  place.myson = await one(
    "INSERT INTO destinations (slug, name, coverage) VALUES ('areas-my-son', 'Mỹ Sơn', 'area') RETURNING id",
  );
  await pool.query(
    `INSERT INTO destination_links (key, from_destination_id, to_destination_id, kind, minutes,
                                    mode, day_length, cost_pp_minor, cost_currency, sources)
     VALUES ('areas-da-nang>areas-hoi-an:day_trip', $1, $2, 'day_trip', 45, 'car', 'full', 300000,
             'VND', $4),
            ('areas-da-nang>areas-hue:onward', $1, $3, 'onward', 150, 'train', NULL, NULL, NULL, $4)`,
    [place.daNang, place.hoiAn, place.hue, SOURCES],
  );
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

describe('tripAreas', () => {
  it('reads a trip with no stops as its destination on every day', async () => {
    const { tripId } = await newTrip();
    const areas = await areasOf(tripId);
    expect(areas?.stops).toMatchObject([
      { position: 1, destinationId: place.daNang, firstDay: 1, lastDay: 5, onwardLink: null },
    ]);
    expect(areas?.days.map((day) => [day.dayNo, day.areaId, day.link])).toEqual(
      [1, 2, 3, 4, 5].map((dayNo) => [dayNo, place.daNang, null]),
    );
    expect(areas?.areaIds).toEqual([place.daNang]);
    expect(await withSystem(pool, (tx) => tripAreaIds(tx, tripId, true))).toEqual([place.daNang]);
  });

  it('splits two stops of two nights over five days into days 1-2 and 3-5', async () => {
    const { tripId, crewId } = await newTrip();
    await stops(tripId, crewId, [
      [place.daNang, 2],
      [place.hue, 2],
    ]);
    const areas = await areasOf(tripId);
    expect(areas?.stops.map((stop) => [stop.destinationId, stop.firstDay, stop.lastDay])).toEqual([
      [place.daNang, 1, 2],
      [place.hue, 3, 5],
    ]);
    expect(areas?.stops[1]?.onwardLink).toMatchObject({ minutes: 150, mode: 'train' });
    expect(areas?.days.map((day) => day.stopPosition)).toEqual([1, 1, 2, 2, 2]);
    expect(new Set(areas?.areaIds)).toEqual(new Set([place.daNang, place.hue]));
  });

  it('names a day trip and its link, and no link once the link is gone', async () => {
    const { tripId, versionId } = await newTrip();
    await setArea(versionId, 3, place.hoiAn);
    const areas = await areasOf(tripId);
    const day3 = areas?.days.find((day) => day.dayNo === 3);
    expect(day3).toMatchObject({ areaId: place.hoiAn, stopPosition: 1 });
    expect(day3?.link).toMatchObject({
      kind: 'day_trip',
      minutes: 45,
      dayLength: 'full',
      costPpMinor: 300000,
      costCurrency: 'VND',
      estimate: true,
    });
    expect(await withSystem(pool, (tx) => dayArea(tx, tripId, day3?.dayId ?? ''))).toMatchObject({
      areaId: place.hoiAn,
    });

    // Mỹ Sơn has no link from Đà Nẵng: the day keeps its area and shows no travel line.
    await setArea(versionId, 4, place.myson);
    const after = await areasOf(tripId);
    expect(after?.days.find((day) => day.dayNo === 4)).toMatchObject({
      areaId: place.myson,
      link: null,
    });
  });

  it("counts a draft's day area only when drafts are asked for", async () => {
    const { tripId } = await newTrip();
    const draft = await newVersion(tripId, 'organiser', 'draft');
    await setArea(draft, 2, place.hoiAn);
    const crewOnly = await withSystem(pool, (tx) => tripAreaIds(tx, tripId));
    const withDrafts = await withSystem(pool, (tx) => tripAreaIds(tx, tripId, true));
    expect(crewOnly).toEqual([place.daNang]);
    expect(new Set(withDrafts)).toEqual(new Set([place.daNang, place.hoiAn]));
    // A superseded version's day areas never count.
    await pool.query("UPDATE itinerary_versions SET status = 'superseded' WHERE id = $1", [draft]);
    expect(await withSystem(pool, (tx) => tripAreaIds(tx, tripId, true))).toEqual([place.daNang]);
  });

  it('agrees with the pure day rule and the SQL set on a table of routes', async () => {
    const routes: [string, number][][] = [
      [[place.daNang, 4]],
      [
        [place.daNang, 1],
        [place.hue, 3],
      ],
      [
        [place.daNang, 3],
        [place.hue, 1],
      ],
    ];
    for (const route of routes) {
      const { tripId, crewId, versionId } = await newTrip();
      await stops(tripId, crewId, route);
      await setArea(versionId, 2, place.myson);
      const areas = await areasOf(tripId);
      const pure = [1, 2, 3, 4, 5].map(
        (day) =>
          route[
            stopIndexOfDay(
              route.map(([, nights]) => ({ nights })),
              day,
            )
          ]?.[0],
      );
      expect(areas?.days.map((day) => (day.dayNo === 2 ? undefined : day.areaId))).toEqual(
        pure.map((id, index) => (index === 1 ? undefined : id)),
      );
      const sql = await withSystem(pool, (tx) => tripAreaIds(tx, tripId));
      expect(new Set(sql)).toEqual(new Set(areas?.areaIds));
    }
  });
});
