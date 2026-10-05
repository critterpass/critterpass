/**
 * "Just me" over the crew's plan: a stop I skip is marked (it stays the crew's), a crew stop I
 * changed for myself is marked as mine alone, a stop only I added is listed on its day, a change
 * the crew's plan moved under or took out comes back as a clash, and a layer I dropped leaves no
 * mark.
 */
jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('@/data/powersync/test-support/node-realm')
      .powersyncCommon,
);

import { beforeAll, describe, expect, it, jest } from '@jest/globals';
import type { PlanState } from '@cp/domain';
import { i18n } from '@lingui/core';

import { addedDisplay, NO_PERSONAL_LAYER, personalLayer } from '../personal-layer';
import { buildTripDays } from '../trip-days';

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
});

const ME = '01a00000-0000-7000-8000-000000000001';
const MARKET = '01a00000-0000-7000-8000-0000000000a1';
const BRIDGE = '01a00000-0000-7000-8000-0000000000a2';
const CAFE = '01a00000-0000-7000-8000-0000000000a3';
const CAFE_POI = '01a00000-0000-7000-8000-0000000000b3';

const CREW: PlanState = {
  days: [{ day_no: 1, date: '2026-10-05', theme: null }],
  items: [
    {
      stable_id: MARKET,
      day_no: 1,
      starts_at: '2026-10-05T07:00:00Z',
      ends_at: '2026-10-05T08:00:00Z',
      created_by_kind: 'guide',
    },
    {
      stable_id: BRIDGE,
      day_no: 1,
      starts_at: '2026-10-05T12:00:00Z',
      ends_at: '2026-10-05T13:00:00Z',
      created_by_kind: 'guide',
    },
  ],
};

function row(id: string, ops: unknown[], status = 'active') {
  return { id, ops: JSON.stringify(ops), status };
}
const op = (kind: string, target: string, after?: Record<string, unknown>) => ({
  op: kind,
  target,
  ...(after === undefined ? {} : { after }),
  reason: 'just me',
  affected_user_ids: [ME],
  booking_impact: false,
});

describe('my personal layer', () => {
  it('marks a stop I skip, a stop I changed for myself, and lists a stop only I have', () => {
    const layer = personalLayer(
      CREW,
      [
        row('r1', [op('remove', MARKET)]),
        row('r2', [op('retime', BRIDGE, { starts_at: '2026-10-05T13:00:00Z' })]),
        row('r3', [
          op('add', CAFE, { day_no: 1, poi_id: CAFE_POI, starts_at: '2026-10-05T09:00:00Z' }),
        ]),
      ],
      ME,
    );
    expect([...layer.marks]).toEqual([
      [MARKET, 'skipping'],
      [BRIDGE, 'only_me'],
    ]);
    expect(layer.added.map((item) => item.stable_id)).toEqual([CAFE]);
    expect(layer.clashes).toEqual([]);
  });

  it('returns a change the crew moved under, or took out, as a clash to settle', () => {
    const GONE = '01a00000-0000-7000-8000-0000000000a9';
    const layer = personalLayer(
      CREW,
      [
        row('r2', [
          {
            ...op('retime', BRIDGE, { starts_at: '2026-10-05T13:00:00Z' }),
            before: { starts_at: '2026-10-05T11:00:00Z' },
          },
        ]),
        row('r4', [op('retime', GONE, { starts_at: '2026-10-05T15:00:00Z' })]),
      ],
      ME,
    );
    expect(layer.clashes).toEqual([
      { personalOpsId: 'r2', stableId: BRIDGE, kind: 'changed_by_crew' },
      { personalOpsId: 'r4', stableId: GONE, kind: 'removed_by_crew' },
    ]);
  });

  it('is empty with no rows, a dropped layer, or nobody signed in', () => {
    expect(personalLayer(CREW, [], ME)).toBe(NO_PERSONAL_LAYER);
    expect(personalLayer(CREW, [row('r1', [op('remove', MARKET)], 'dropped')], ME)).toBe(
      NO_PERSONAL_LAYER,
    );
    expect(personalLayer(CREW, [row('r1', [op('remove', MARKET)])], null)).toBe(NO_PERSONAL_LAYER);
  });

  it('keeps the skipped stop on the crew’s day and lists mine under it, off the route', () => {
    const layer = personalLayer(
      CREW,
      [
        row('r1', [op('remove', MARKET)]),
        row('r3', [
          op('add', CAFE, { day_no: 1, poi_id: CAFE_POI, starts_at: '2026-10-05T09:00:00Z' }),
        ]),
      ],
      ME,
    );
    const display = addedDisplay(layer.added, [
      { id: CAFE_POI, name: 'Cộng Cà Phê', lat: 16.07, lng: 108.22 },
    ]);
    const [day] = buildTripDays({
      state: CREW,
      display: new Map(),
      dayRows: [{ id: 'day-1', day_no: 1 }],
      themes: new Map(),
      tz: 'Asia/Ho_Chi_Minh',
      polls: [],
      issues: [],
      personal: { layer, display },
    });
    expect(day?.stops.map((stop) => stop.stableId)).toEqual([MARKET, BRIDGE]);
    expect(day?.personal?.get(MARKET)).toBe('skipping');
    expect(day?.mine?.map((stop) => [stop.title, stop.start, stop.place])).toEqual([
      ['Cộng Cà Phê', 16 * 60, { lat: 16.07, lng: 108.22 }],
    ]);
  });

  it('leaves a day untouched when nothing on it is mine alone', () => {
    const [day] = buildTripDays({
      state: CREW,
      display: new Map(),
      dayRows: [{ id: 'day-1', day_no: 1 }],
      themes: new Map(),
      tz: 'Asia/Ho_Chi_Minh',
      polls: [],
      issues: [],
      personal: { layer: NO_PERSONAL_LAYER, display: new Map() },
    });
    expect(day?.personal).toBeUndefined();
    expect(day?.mine).toBeUndefined();
  });
});
