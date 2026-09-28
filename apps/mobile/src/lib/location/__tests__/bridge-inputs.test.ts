import { describe, expect, it } from '@jest/globals';

import {
  activeShare,
  dayPlan,
  planPoiSql,
  toTripModeTrip,
  tripSql,
  type PlanPoiRow,
} from '../bridge-inputs';

const NOW = Date.parse('2026-10-12T02:00:00Z');
const TRIP = '01928f3e-7b1a-7c2d-8e9f-0a1b2c3d4e5f';

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
