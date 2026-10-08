/**
 * A day's rows: the check's note prints once and never with a missing stop, what is mine alone
 * says so, today's stops know whether they are over, on now or next, and the day opens and closes
 * at the stay.
 */
jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('@/data/powersync/test-support/node-realm')
      .powersyncCommon,
);

import { beforeAll, describe, expect, it, jest } from '@jest/globals';
import type { PlanCheckIssue } from '@cp/domain';
import { i18n } from '@lingui/core';

import type { DayItem } from '@/data/plan/plan-model';

import { showsGap } from '../day-gaps';
import { dayProgress, nextGoStop } from '../next-stop';
import { buildStopRows, noteStops, stayRows } from '../stop-rows';
import type { TripDay } from '../trip-days';

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
});

const TZ = 'Asia/Ho_Chi_Minh';

function stop(stableId: string, start: number, end: number): DayItem {
  return {
    stableId,
    dayNo: 1,
    title: stableId,
    category: null,
    start,
    end,
    tz: TZ,
    lane: null,
    attendeeIds: [],
    lock: null,
    status: 'planned',
    byGuide: true,
    notes: null,
    poiId: `poi-${stableId}`,
    place: { lat: 16, lng: 108 },
    amountMinor: null,
    currency: null,
    costModel: null,
    bookingId: null,
  };
}

const clash = (first: string, second: string) =>
  ({
    id: `${first}-${second}`,
    kind: 'clash',
    severity: 'fix',
    day_id: 'day-1',
    stable_ids: [first, second],
    params: { first, second, short_minutes: 19 },
    fix: { kind: 'none' },
  }) as unknown as PlanCheckIssue;

function day(stops: DayItem[], extra: Partial<TripDay> = {}): TripDay {
  return {
    dayNo: 1,
    dayId: 'day-1',
    date: '2026-10-04',
    theme: null,
    color: 'pink',
    items: stops,
    stops,
    stay: null,
    pace: 1,
    vote: null,
    booked: false,
    issues: [],
    tag: null,
    ...extra,
  };
}

const MARKET = stop('market', 9 * 60, 10 * 60);
const MUSEUM = stop('museum', 12 * 60, 14 * 60);
const BRIDGE = stop('bridge', 18 * 60, 19 * 60);
const rowsOf = (of: TripDay, now?: Date) =>
  buildStopRows({
    locale: 'en-GB',
    day: of,
    after: [],
    gaps: [],
    members: [],
    me: null,
    progress: now === undefined ? null : dayProgress(of, now, TZ),
  });

describe('the check’s note on a day', () => {
  it('prints a clash once, under the first of its two stops', () => {
    const rows = rowsOf(day([MARKET, MUSEUM, BRIDGE], { issues: [clash('museum', 'bridge')] }));
    expect(rows.map((row) => row.note?.id ?? null)).toEqual([null, 'museum-bridge', null]);
    // Both stops are still outlined as needing a look.
    expect(rows.map((row) => row.issue !== null)).toEqual([false, true, true]);
  });

  it('prints nothing for a clash whose other stop left the day', () => {
    expect(noteStops(day([MARKET, MUSEUM], { issues: [clash('museum', 'bridge')] })).size).toBe(0);
  });
});

describe('what is mine alone on a day', () => {
  it('says so on the stop, over any other detail', () => {
    const rows = rowsOf(
      day([MARKET, MUSEUM], { personal: new Map([['market', 'skipping'] as const]) }),
    );
    expect(rows.map((row) => [row.personal, row.detail])).toEqual([
      ['skipping', 'You’re skipping this'],
      [null, undefined],
    ]);
  });
});

describe('a change the crew has not decided on', () => {
  it('tags the stops it touches and leaves them where the plan has them', () => {
    const rows = rowsOf(day([MARKET, MUSEUM], { suggested: new Set(['museum']) }));
    expect(rows.map((row) => [row.stop.stableId, row.detail])).toEqual([
      ['market', undefined],
      ['museum', 'Suggested · waiting for the crew'],
    ]);
  });
});

describe('where today is', () => {
  // 13:00 on 4 October in Đà Nẵng.
  const NOW = new Date('2026-10-04T06:00:00Z');

  it('ticks what is over, marks the stop on now and the next one, and draws NOW once', () => {
    const rows = rowsOf(day([MARKET, MUSEUM, BRIDGE]), NOW);
    expect(rows.map((row) => row.moment)).toEqual(['done', 'now', 'next']);
    expect(rows.map((row) => row.nowLine)).toEqual([null, '13:00', null]);
  });

  it('marks nothing on a day that is not today', () => {
    const rows = rowsOf(day([MARKET, MUSEUM], { date: '2026-10-05' }), NOW);
    expect(rows.every((row) => row.moment === null && row.nowLine === null)).toBe(true);
  });

  it('never makes a stop I skip the next one, nor offers GO on it', () => {
    const mine = day([MARKET, stop('lunch', 14 * 60, 15 * 60), BRIDGE], {
      personal: new Map([['lunch', 'skipping'] as const]),
    });
    expect(rowsOf(mine, NOW).map((row) => row.moment)).toEqual(['done', null, 'next']);
    expect(nextGoStop(mine, NOW, TZ)).toBe('bridge');
  });
});

describe('the ends of the day at the stay', () => {
  const leg = (minutes: number) =>
    ({ mode: 'drive', minutes, approx: false, source: 'valhalla' }) as never;

  it('says when to leave for the first stop and when the day is back', () => {
    const edges = stayRows('en-GB', day([MARKET, BRIDGE]), { fromStay: leg(70), toStay: leg(40) });
    expect(edges.leave).toEqual({ time: '7:50', leg: 'Car · 1h10' });
    expect(edges.back).toEqual({ time: '19:40', leg: 'Car · 40 min' });
  });

  it('has neither without a stay', () => {
    expect(stayRows('en-GB', day([MARKET]), {})).toEqual({ leave: null, back: null });
  });
});

describe('free time worth a slot', () => {
  const LAST = 18 * 60;

  it('shows when part of the crew is free while the rest is busy', () => {
    expect(showsGap({ from: 600, to: 660, whoFree: ['a', 'b'] }, 4, LAST)).toBe(true);
  });

  it('shows everyone’s free time only from three hours, and never after the last stop', () => {
    const all = ['a', 'b', 'c', 'd'];
    expect(showsGap({ from: 600, to: 720, whoFree: all }, 4, LAST)).toBe(false);
    expect(showsGap({ from: 600, to: 780, whoFree: all }, 4, LAST)).toBe(true);
    expect(showsGap({ from: 19 * 60, to: 22 * 60, whoFree: all }, 4, LAST)).toBe(false);
  });
});

describe('a stop she said she is at', () => {
  it('says so on its row, with when she arrived', () => {
    const rows = buildStopRows({
      locale: 'en-GB',
      day: day([MARKET, MUSEUM, BRIDGE]),
      after: [],
      gaps: [],
      members: [],
      me: null,
      here: new Map([['museum', '13:01']]),
    });
    expect(rows.map((row) => row.detail?.includes('13:01') === true)).toEqual([false, true, false]);
  });
});
