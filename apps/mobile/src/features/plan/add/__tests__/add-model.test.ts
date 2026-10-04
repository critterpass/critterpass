/**
 * Add to plan's choices: a drop's day is kept over Tokek's pick, picking another day moves the
 * block to that day's fitted time (and its reasons with it), a picked time is judged on the phone,
 * and a member's add becomes a change set op the crew votes on.
 */
import { describe, expect, it } from '@jest/globals';
import type { DayFit, PlaceFit, PlanState } from '@cp/domain';

import { toChangeSetOps } from '@/data/plan/plan-ops';

import { addOps, initialChoice, pickDay, pickTime, shownDayFit, type AddDay } from '../add-model';
import { isWhereItIs, stopOfPlace } from '../placed-stop';

const TZ = 'Asia/Makassar';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const DAYS: AddDay[] = [
  { dayNo: 1, date: '2026-10-13' },
  { dayNo: 2, date: '2026-10-14' },
  { dayNo: 5, date: '2026-10-17' },
];

const day = (dayNo: number, date: string, start: string | null, extra: Partial<DayFit> = {}) => ({
  day_id: id(100 + dayNo),
  day_no: dayNo,
  grade: start === null ? ('no' as const) : ('good' as const),
  slot:
    start === null
      ? null
      : {
          starts_at: `${date}T${start}:00+08:00`,
          ends_at: `${date}T${start.replace(/^(\d\d)/u, (h) => String(Number(h) + 1).padStart(2, '0'))}:30+08:00`,
        },
  reasons:
    start === null
      ? [{ code: 'no_window' as const, params: { day_no: dayNo } }]
      : [{ code: 'opens_at' as const, params: { time: start } }],
  ...extra,
});

const FIT: PlaceFit = {
  poi_id: id(1),
  best: {
    day_id: id(105),
    day_no: 5,
    grade: 'good',
    slot: { starts_at: '2026-10-17T08:00:00+08:00', ends_at: '2026-10-17T09:30:00+08:00' },
  },
  days: [
    day(1, '2026-10-13', null),
    day(2, '2026-10-14', '16:00', { grade: 'possible' }),
    day(5, '2026-10-17', '08:00'),
  ],
};

describe('add to plan choices', () => {
  it("starts on Tokek's best day and time", () => {
    expect(initialChoice(FIT, {}, DAYS, TZ)).toEqual({
      dayNo: 5,
      startMin: 480,
      timePicked: false,
    });
  });

  it('keeps the day an idea was dropped on, at that day’s fitted time', () => {
    expect(initialChoice(FIT, { dayNo: 2 }, DAYS, TZ)).toEqual({
      dayNo: 2,
      startMin: 16 * 60,
      timePicked: false,
    });
    expect(initialChoice(FIT, { dayNo: 2, startMin: 600 }, DAYS, TZ)).toMatchObject({
      dayNo: 2,
      startMin: 600,
    });
    expect(initialChoice(FIT, { after: { dayNo: 1, endMin: 900 } }, DAYS, TZ)).toMatchObject({
      dayNo: 1,
      startMin: 900,
    });
  });

  it('moves the block and its reasons when another day is picked', () => {
    const first = initialChoice(FIT, {}, DAYS, TZ)!;
    const moved = pickDay(first, 2, FIT, TZ);
    expect(moved).toEqual({ dayNo: 2, startMin: 960, timePicked: false });
    expect(shownDayFit(moved, FIT, null)?.reasons).toEqual([
      { code: 'opens_at', params: { time: '16:00' } },
    ]);
    // A day with no fitted time keeps the block's time.
    expect(pickDay(moved, 1, FIT, TZ)).toEqual({ dayNo: 1, startMin: 960, timePicked: false });
  });

  it("judges a picked time with the phone's own fit", () => {
    const picked = pickTime(initialChoice(FIT, {}, DAYS, TZ)!, 11 * 60);
    const local: PlaceFit = {
      ...FIT,
      days: [day(5, '2026-10-17', '11:00', { grade: 'possible' })],
    };
    expect(shownDayFit(picked, FIT, local)?.grade).toBe('possible');
  });

  it('turns a member’s add into a change set op the crew votes on', () => {
    const choice = initialChoice(FIT, {}, DAYS, TZ)!;
    const ops = addOps({
      choice,
      day: DAYS[2]!,
      tz: TZ,
      place: { poiId: id(1), name: 'Tirta Empul', category: 'temple_shrine' },
      lengthMin: 90,
      attendeeIds: [],
      nearby: {
        poiId: id(2),
        name: 'Gunung Kawi',
        category: 'temple_shrine',
        minutes: 10,
        lengthMin: 60,
      },
      stableIds: [id(201), id(202)],
    });
    expect(ops).toHaveLength(2);
    expect(ops[1]).toMatchObject({
      op: 'add',
      new: { poi_id: id(2), starts_at: '2026-10-17T01:40:00.000Z' },
    });
    const state: PlanState = { days: [], items: [] };
    const change = toChangeSetOps(ops, state, [id(9), id(10)], {
      moved: 'moved',
      added: 'added',
      removed: 'removed',
    });
    expect(change[0]).toMatchObject({
      op: 'add',
      target: id(201),
      after: { day_no: 5, poi_id: id(1), starts_at: '2026-10-17T00:00:00.000Z' },
      affected_user_ids: [id(9), id(10)],
    });
  });

  it('carries a dropped pin’s own spot on the stop', () => {
    const [op] = addOps({
      choice: { dayNo: 5, startMin: 600, timePicked: true },
      day: DAYS[2]!,
      tz: TZ,
      place: {
        poiId: null,
        name: 'Our ramen spot',
        category: 'food',
        pin: { lat: -8.5, lng: 115.2 },
      },
      lengthMin: 60,
      attendeeIds: [id(9)],
      nearby: null,
      stableIds: [id(201), id(202)],
    });
    expect(op).toMatchObject({
      new: {
        custom_place: { name: 'Our ramen spot', lat: -8.5, lng: 115.2 },
        attendee_ids: [id(9)],
      },
    });
  });
});

describe('a place that is already in the plan', () => {
  const stop = { stableId: id(7), dayNo: 2, startMin: 18 * 60 };
  const rows = [
    { stable_id: id(7), poi_id: id(1), poi_lat: -8.5, poi_lng: 115.26 },
    { stable_id: id(8), poi_id: id(2), poi_lat: -8.51, poi_lng: 115.262 },
  ];
  const titles = new Map([
    [id(7), 'Ubud Coffee Roastery'],
    [id(8), 'Pura Dalem Ubud'],
  ]);
  const titleOf = (stableId: string) => titles.get(stableId) ?? null;

  it('is found by its place, and by its name on the same spot when the catalogue holds it twice', () => {
    const place = { poiId: id(1), name: 'Ubud Coffee', lat: 0, lng: 0 };
    expect(stopOfPlace(place, rows, titleOf)?.stable_id).toBe(id(7));
    const twin = { poiId: id(99), name: ' pura dalem ubud ', lat: -8.5101, lng: 115.2621 };
    expect(stopOfPlace(twin, rows, titleOf)?.stable_id).toBe(id(8));
    const namesake = { poiId: id(99), name: 'Pura Dalem Ubud', lat: -8.7, lng: 115.1 };
    expect(stopOfPlace(namesake, rows, titleOf)).toBe(undefined);
  });

  it('opens on the day it was opened from, never on where the stop already is', () => {
    const fromDayFive = initialChoice(FIT, { dayNo: 5 }, DAYS, TZ, stop);
    expect(fromDayFive).toEqual({ dayNo: 5, startMin: 480, timePicked: false });
    expect(isWhereItIs(fromDayFive, stop)).toBe(false);
    // A day with no fitted slot keeps the stop's own time rather than inventing one.
    expect(initialChoice(FIT, { dayNo: 1 }, DAYS, TZ, stop)).toEqual({
      dayNo: 1,
      startMin: 18 * 60,
      timePicked: false,
    });
  });

  it('has nothing to move while the choice is still the stop’s own day and time', () => {
    const nothingKnown = initialChoice(null, {}, DAYS, TZ, stop);
    expect(nothingKnown).toEqual({ dayNo: 2, startMin: 18 * 60, timePicked: false });
    expect(isWhereItIs(nothingKnown, stop)).toBe(true);
    expect(isWhereItIs(pickTime(nothingKnown!, 19 * 60), stop)).toBe(false);
    expect(isWhereItIs(nothingKnown, null)).toBe(false);
  });
});
