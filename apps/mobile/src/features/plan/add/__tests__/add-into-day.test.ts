/**
 * A block added at a time the fit did not choose: with nothing to go on it starts after the day's
 * last stop (not on top of the morning), a time that overlaps the stop before it can't be added,
 * and a time that overlaps the stop after it pushes that stop later instead of sitting on it.
 */
import { i18n } from '@lingui/core';
import { beforeAll, describe, expect, it } from '@jest/globals';

import type { DayFit, PlanState } from '@cp/domain';
import { fitPlace, type FitContext, type FitPlace } from '@cp/planner';

import { instantOnDay, minutesOnDay } from '@/data/plan/plan-model';
import type { TripPlan } from '@/data/plan/use-trip-plan';

import { addIntoDay, openStartOn, settleAdd } from '../add-into-day';

const TZ = 'Asia/Makassar';
const DATE = '2026-10-20';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const at = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const stop = (n: number, dayNo: number, date: string, from: string, to: string) => ({
  stable_id: id(n),
  day_no: dayNo,
  tz: TZ,
  starts_at: instantOnDay(date, at(from), TZ),
  ends_at: instantOnDay(date, at(to), TZ),
});

const state: PlanState = {
  days: [
    { day_no: 2, date: DATE, theme: null },
    { day_no: 3, date: '2026-10-21', theme: null },
    { day_no: 4, date: '2026-10-22', theme: null },
  ],
  items: [
    stop(1, 2, DATE, '10:00', '11:00'),
    stop(2, 2, DATE, '12:00', '13:00'),
    stop(3, 3, '2026-10-21', '20:00', '22:30'),
  ],
};
// Only what the timing reads of the plan: its stops and their names.
const plan = { state, display: new Map() } as unknown as TripPlan;
const DAY = { dayNo: 2, date: DATE };
const block = (from: string, to: string) => ({
  stableId: id(9),
  title: 'Desa Spa',
  start: at(from),
  end: at(to),
  place: null,
});

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
});

describe('a block the fit did not time', () => {
  it('starts after the day’s last stop, or mid-morning on an empty or late day', () => {
    expect(openStartOn(plan, 2, TZ)).toBe(at('13:00'));
    expect(openStartOn(plan, 4, TZ)).toBe(at('10:00'));
    expect(openStartOn(plan, 3, TZ)).toBe(at('10:00'));
  });

  it('can’t be added on top of the stop before it', () => {
    const into = addIntoDay({
      plan,
      day: DAY,
      tz: TZ,
      locale: 'en',
      block: block('10:30', '12:00'),
    });
    expect(into).toMatchObject({ blocked: true, ops: [] });
    expect(into?.line).toContain('or later');
  });

  it('pushes the stop after it later instead of overlapping it', () => {
    const into = addIntoDay({
      plan,
      day: DAY,
      tz: TZ,
      locale: 'en',
      block: block('11:00', '12:30'),
    });
    expect(into?.blocked).toBe(false);
    expect(into?.line).toBe('1 later stop moves by 30 min');
    const [push] = into?.ops ?? [];
    expect(push).toMatchObject({ op: 'move', item: id(2) });
    const start = push?.op === 'move' ? push.new.starts_at : undefined;
    expect(minutesOnDay(start ?? '', TZ, DATE)).toBe(at('12:30'));
  });

  it('says nothing and moves nothing when it lands in free time', () => {
    expect(
      addIntoDay({ plan, day: DAY, tz: TZ, locale: 'en', block: block('13:00', '14:30') }),
    ).toEqual({ ops: [], line: null, blocked: false });
    expect(addIntoDay({ plan, day: null, tz: TZ, locale: 'en', block: null })).toBe(null);
  });
});

describe('the suggestion and the refusal are one rule', () => {
  // The day's stops stand far apart as the crow flies, while the routed way the engine fits with
  // is a quarter of an hour: the sheet's own estimate would refuse what the engine suggests.
  const spots = new Map([
    [id(1), { lat: -8.5, lng: 115.26 }],
    [id(2), { lat: -8.72, lng: 115.17 }],
  ]);
  const far = {
    state,
    display: new Map([...spots].map(([key, place]) => [key, { title: key, place }])),
  } as unknown as TripPlan;
  const context: FitContext = {
    tz: TZ,
    participants: [id(91)],
    driveFactor: 1.3,
    travel: () => ({ minutes: 15, mode: 'drive', approx: false }),
    days: [
      {
        dayId: id(102),
        dayNo: 2,
        date: DATE,
        kind: 'full',
        fromMin: 7 * 60,
        toMin: 22 * 60,
        stay: null,
        rain: null,
        crowdFactor: 1,
        items: state.items
          .filter((item) => item.day_no === 2)
          .map((item) => ({
            stableId: item.stable_id,
            poiId: null,
            category: 'other',
            startsAt: new Date(item.starts_at ?? ''),
            endsAt: new Date(item.ends_at ?? ''),
            attendeeIds: [],
            locked: false,
            outdoor: false,
            point: spots.get(item.stable_id) ?? null,
          })),
      },
    ],
  };
  const place = (extra: Partial<FitPlace>): FitPlace => ({
    poiId: null,
    point: { lat: -8.62, lng: 115.09 },
    category: 'museum',
    hours: null,
    outdoor: false,
    ...extra,
  });
  const settle = (shown: DayFit | null, startMin: number, timePicked: boolean) =>
    settleAdd({
      plan: far,
      day: DAY,
      tz: TZ,
      locale: 'en',
      first: { dayNo: 2, startMin, timePicked },
      shown,
      subject: { name: 'New place', lat: -8.62, lng: 115.09 },
      stableId: id(9),
      lengthMin: 60,
      skip: false,
    });

  it('never refuses a start the engine proposes, whatever kind of place and however long', () => {
    const places = [
      place({}),
      place({ category: 'food', name: 'Warung Nuri', timeNeededMin: 75 }),
      place({ category: 'nightlife', name: '40 Thieves' }),
      place({ category: 'temple_shrine', name: 'Tanah Lot', bestTimeText: 'Sunset hour' }),
      place({ timeNeededMin: 45, point: { lat: -8.5, lng: 115.261 } }),
      place({ timeNeededMin: 240 }),
    ];
    for (const candidate of places) {
      const shown = fitPlace(context, candidate).days[0] ?? null;
      expect(shown?.slot).not.toBeNull();
      const startMin = minutesOnDay(shown?.slot?.starts_at ?? '', TZ, DATE);
      const { into } = settle(shown, startMin, false);
      expect(into?.blocked ?? false).toBe(false);
    }
  });

  it('opens on the first start that can be added when the suggested one sits on a stop', () => {
    // A slot that only works if the 10:00 stop moves, and starts while that stop is still on.
    const shown: DayFit = {
      day_id: id(102),
      day_no: 2,
      grade: 'possible',
      slot: {
        starts_at: instantOnDay(DATE, at('10:30'), TZ),
        ends_at: instantOnDay(DATE, at('11:30'), TZ),
      },
      reasons: [],
      needs_move: id(1),
    };
    const { choice, into } = settle(shown, at('10:30'), false);
    expect({ start: choice?.startMin, into }).toMatchObject({ into: { blocked: false } });
    expect(choice?.startMin).toBeGreaterThanOrEqual(at('11:00'));
  });

  it('never moves a time the person picked: it says why and offers the first start that works', () => {
    const { choice, into } = settle(null, at('10:30'), true);
    expect(choice?.startMin).toBe(at('10:30'));
    expect(into).toMatchObject({ blocked: true });
    expect(into?.useStart).toBeGreaterThanOrEqual(at('11:00'));
  });
});
