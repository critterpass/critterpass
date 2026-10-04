import { openSpans, openThrough } from '@cp/domain';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { reorderDay, routeDrive, type CheckInput } from '../../src/check/index';
import { DEFAULT_MEAL_WINDOWS, straightLineTravel, type FitItem } from '../../src/fit/index';
import { at, daily, VILLA } from '../fit/bali-fixture';
import { TUESDAY, tuesdayDay, tuesdayInput } from './tuesday-fixture';

const stable = (n: number) => `00000000-0000-4000-8000-00000000f${String(n).padStart(3, '0')}`;
const poi = (n: number) => `00000000-0000-4000-8000-00000000b${String(n).padStart(3, '0')}`;
const clock = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

const HOURS = [daily('08:00', '18:00'), daily('10:00', '22:00'), daily('07:00', '13:00')];
const DRIVE_FACTOR = 1.3;

interface Drawn {
  readonly hours: number;
  readonly item: FitItem;
}

const itemArb = (index: number) =>
  fc
    .record({
      startQ: fc.integer({ min: 32, max: 80 }),
      lengthQ: fc.integer({ min: 2, max: 8 }),
      locked: fc.boolean(),
      food: fc.boolean(),
      hours: fc.integer({ min: -1, max: 2 }),
      x: fc.integer({ min: -60, max: 60 }),
      y: fc.integer({ min: -60, max: 60 }),
    })
    .map((raw): Drawn => ({
      hours: raw.hours,
      item: {
        stableId: stable(index),
        poiId: raw.hours < 0 ? null : poi(index),
        category: raw.food ? 'food' : 'other',
        startsAt: at(13, clock(raw.startQ * 15)),
        endsAt: at(13, clock(Math.min(raw.startQ + raw.lengthQ, 92) * 15)),
        attendeeIds: [],
        locked: raw.locked,
        outdoor: false,
        point: { lat: VILLA.lat + raw.y / 500, lng: VILLA.lng + raw.x / 500 },
      },
    }));

const dayArb = fc
  .integer({ min: 2, max: 7 })
  .chain((count) => fc.tuple(...Array.from({ length: count }, (_, i) => itemArb(i))));

/** Straight-line travel (no fixed legs), the drawn places' own hours. */
function inputOf(drawn: readonly Drawn[]): CheckInput {
  const base = tuesdayInput(tuesdayDay(drawn.map((entry) => entry.item)));
  const { travel: _fixed, ...context } = base.context;
  const places = new Map(
    drawn.flatMap((entry) =>
      entry.item.poiId === null
        ? []
        : [[entry.item.poiId, { hours: HOURS[entry.hours] ?? null, crowds: null }] as const],
    ),
  );
  return { ...base, context: { ...context, driveFactor: DRIVE_FACTOR }, places };
}

/** Local Bali minute of an instant. */
const minuteOf = (instant: Date) => {
  const local = new Date(instant.getTime() + 8 * 3_600_000);
  return local.getUTCHours() * 60 + local.getUTCMinutes();
};

const MEALS = [
  DEFAULT_MEAL_WINDOWS.breakfast,
  DEFAULT_MEAL_WINDOWS.lunch,
  DEFAULT_MEAL_WINDOWS.dinner,
];

describe('reorder properties', { timeout: 60_000 }, () => {
  it('never moves a booked stop, never adds driving, keeps every stop and respects hours and meals', () => {
    fc.assert(
      fc.property(dayArb, (drawn) => {
        const input = inputOf(drawn);
        const result = reorderDay(input, TUESDAY);
        if (result === null) return;
        const items = drawn.map((entry) => entry.item);
        const locked = new Set(items.filter((item) => item.locked).map((item) => item.stableId));
        expect(result.after.driveMin).toBeLessThan(result.before.driveMin);
        expect([...result.after.order].sort()).toEqual(items.map((item) => item.stableId).sort());
        for (const op of result.ops) expect(locked.has(op.target)).toBe(false);
        for (const slot of result.after.schedule) {
          const item = items.find((entry) => entry.stableId === slot.stableId);
          if (item === undefined) throw new Error('a stop appeared from nowhere');
          const was = minuteOf(item.startsAt);
          if (item.locked) expect(slot.start).toBe(was);
          if (slot.start === was) continue;
          const hours = item.poiId === null ? null : input.places.get(item.poiId)?.hours;
          if (hours) {
            expect(
              openThrough(openSpans(hours, '2026-10-13'), slot.start, slot.end),
            ).not.toBeNull();
          }
          const meal = MEALS.find((window) => was >= window.fromMin && was < window.toMin);
          if (item.category === 'food' && meal !== undefined) {
            expect(slot.start).toBeGreaterThanOrEqual(meal.fromMin);
            expect(slot.start).toBeLessThan(meal.toMin);
          }
          for (const other of result.after.schedule) {
            if (other.stableId === slot.stableId) continue;
            expect(other.start < slot.end && other.end > slot.start).toBe(false);
          }
        }
      }),
      { numRuns: 300 },
    );
  });

  it('reports the drive its own schedule takes', () => {
    const travel = straightLineTravel(DRIVE_FACTOR, 1200);
    fc.assert(
      fc.property(dayArb, (drawn) => {
        const result = reorderDay(inputOf(drawn), TUESDAY);
        if (result === null) return;
        const points = new Map(drawn.map((entry) => [entry.item.stableId, entry.item.point]));
        const stops = result.after.schedule.map((slot) => ({
          stableId: slot.stableId,
          point: points.get(slot.stableId) ?? null,
          start: slot.start,
        }));
        expect(routeDrive(stops, VILLA, travel)).toBe(result.after.driveMin);
      }),
      { numRuns: 100 },
    );
  });
});
