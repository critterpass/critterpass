import { describe, expect, it } from '@jest/globals';

import { PlainSqlite } from '@/data/powersync/test-support/node-realm';

import {
  activeShare,
  dayPlan,
  planPoiSql,
  toTripModeTrip,
  tripSql,
  type PlanPoiRow,
  type TripRow,
} from '../bridge-inputs';

const NOW = Date.parse('2026-10-12T02:00:00Z');
const TRIP = '01928f3e-7b1a-7c2d-8e9f-0a1b2c3d4e5f';
const USER = '01928f3e-7b1a-7c2d-8e9f-0a1b2c3d4e60';

describe('engine inputs from synced rows', () => {
  it('only ever inlines UUIDs into the watched SQL', () => {
    expect(tripSql(TRIP)).toContain(`p.user_id = '${TRIP}'`);
    expect(() => tripSql("x' OR 1=1 --")).toThrow(/not a uuid/);
    expect(() => planPoiSql('')).toThrow(/not a uuid/);
  });

  it('maps the trip row, or none', () => {
    expect(toTripModeTrip(undefined)).toBeNull();
    expect(
      toTripModeTrip({
        id: TRIP,
        status: 'in_trip',
        start_date: '2026-10-10',
        end_date: '2026-10-14',
        tz: 'Asia/Makassar',
        destination_country: 'ID',
      }),
    ).toEqual({
      status: 'in_trip',
      startDate: '2026-10-10',
      endDate: '2026-10-14',
      tz: 'Asia/Makassar',
      destinationCountry: 'ID',
    });
  });

  it('reads the destination country as an ISO code, from the place first', () => {
    const db = new PlainSqlite(':memory:');
    db.exec(`
      CREATE TABLE trips (id TEXT, status TEXT, start_date TEXT, end_date TEXT, tz TEXT, destination_id TEXT);
      CREATE TABLE trip_participants (trip_id TEXT, user_id TEXT, rsvp TEXT, role TEXT);
      CREATE TABLE destinations (id TEXT, country TEXT, critter_set_id TEXT);
      CREATE TABLE critter_sets (id TEXT, country TEXT);
      INSERT INTO critter_sets VALUES ('set-vn', 'VN');
      INSERT INTO destinations VALUES ('da-nang', 'Vietnam', 'set-vn'), ('unplaced', 'Vietnam', NULL);
      INSERT INTO trips VALUES ('${TRIP}', 'in_trip', '2026-10-02', '2026-10-04', 'Asia/Ho_Chi_Minh', 'da-nang');
      INSERT INTO trip_participants VALUES ('${TRIP}', '${USER}', 'in', 'member');
    `);
    const read = () => db.prepare(tripSql(USER)).get() as TripRow;
    expect(read().destination_country).toBe('VN');
    // A destination with no place yet only has the name: the row mapper still yields the code.
    db.exec(`UPDATE trips SET destination_id = 'unplaced'`);
    expect(read().destination_country).toBe('Vietnam');
    expect(toTripModeTrip(read())?.destinationCountry).toBe('VN');
    db.exec(`UPDATE trips SET destination_id = NULL`);
    expect(toTripModeTrip(read())?.destinationCountry).toBeNull();
    db.close();
  });

  it('picks the open share that matters most', () => {
    const rows = [
      {
        id: 'map',
        reason: 'crew_map',
        starts_at: '2026-10-12T00:00:00Z',
        ends_at: null,
        paused: 0,
      },
      { id: 'sos', reason: 'sos', starts_at: '2026-10-12T01:00:00Z', ends_at: null, paused: 1 },
      {
        id: 'old',
        reason: 'help',
        starts_at: '2026-10-11T00:00:00Z',
        ends_at: '2026-10-11T01:00:00Z',
        paused: 0,
      },
      { id: 'later', reason: 'help', starts_at: '2026-10-12T05:00:00Z', ends_at: null, paused: 0 },
    ];
    expect(activeShare(rows, NOW)).toEqual({ id: 'sos', reason: 'sos' });
    expect(activeShare(rows.slice(0, 1), NOW)).toEqual({ id: 'map', reason: 'crew_map' });
    expect(activeShare([{ ...rows[0]!, paused: 1 }], NOW)).toBeNull();
    expect(activeShare([], NOW)).toBeNull();
  });

  it("builds today's plan POIs and the stay in the trip zone", () => {
    const row = (id: string, category: string, startsAt: string | null): PlanPoiRow => ({
      id,
      lat: -8.5,
      lng: 115.26,
      radius: null,
      category,
      starts_at: startsAt,
    });
    const rows = [
      row('warung', 'food', '2026-10-12T04:00:00Z'),
      row('warung', 'food', '2026-10-12T09:00:00Z'),
      row('temple', 'mystery', '2026-10-12T01:00:00Z'),
      row('beach', 'beach', '2026-10-13T02:00:00Z'),
      row('villa-1', 'stay', '2026-10-10T08:00:00Z'),
      row('villa-2', 'stay', '2026-10-12T08:00:00Z'),
      row('villa-3', 'stay', '2026-10-14T08:00:00Z'),
    ];
    const plan = dayPlan(TRIP, rows, NOW, 'Asia/Makassar');
    expect(plan.context.planPois.map((p) => p.id)).toEqual(['warung', 'temple']);
    expect(plan.context.stay?.id).toBe('villa-2');
    expect(plan.candidates.map((c) => `${c.id}:${c.category}`)).toEqual([
      'warung:food',
      'temple:other',
      'villa-2:stay',
    ]);
    const undated = dayPlan(
      TRIP,
      [row('a', 'museum', null), row('s', 'stay', null)],
      NOW,
      'Asia/Makassar',
    );
    expect(undated.context.planPois.map((p) => p.id)).toEqual(['a']);
    expect(undated.context.stay?.id).toBe('s');
  });
});
