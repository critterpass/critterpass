import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { swapDay } from '../../src/check/index';
import type { FitItem } from '../../src/fit/index';
import { at, VILLA } from '../fit/bali-fixture';
import { JATILUWIH_POI, WEDNESDAY, wednesdayDay, wednesdayInput } from './wednesday-fixture';

const stable = (n: number) => `00000000-0000-4000-8000-00000000d${String(n).padStart(3, '0')}`;
const clock = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

const itemArb = (index: number) =>
  fc
    .record({
      startQ: fc.integer({ min: 28, max: 80 }),
      lengthQ: fc.integer({ min: 2, max: 10 }),
      locked: fc.boolean(),
      outdoor: fc.boolean(),
      terraces: fc.boolean(),
      d: fc.integer({ min: -30, max: 30 }),
    })
    .map((raw): FitItem => ({
      stableId: stable(index),
      poiId: raw.terraces ? JATILUWIH_POI : null,
      category: raw.outdoor ? 'nature' : 'other',
      startsAt: at(14, clock(raw.startQ * 15)),
      endsAt: at(14, clock(Math.min(raw.startQ + raw.lengthQ, 88) * 15)),
      attendeeIds: [],
      locked: raw.locked,
      outdoor: raw.outdoor,
      point: { lat: VILLA.lat + raw.d / 1000, lng: VILLA.lng - raw.d / 1000 },
    }));

const rainArb = fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 24, maxLength: 24 });

const dayArb = fc.tuple(
  fc
    .integer({ min: 1, max: 6 })
    .chain((count) => fc.tuple(...Array.from({ length: count }, (_, i) => itemArb(i)))),
  rainArb,
  fc.constantFrom('forecast' as const, 'normals' as const),
);

const wettest = (hourly: readonly number[], start: number, end: number) => {
  let most = 0;
  for (let hour = Math.floor(start / 60); hour * 60 < end && hour < 24; hour += 1) {
    most = Math.max(most, hourly[hour] ?? 0);
  }
  return most;
};

describe('swap properties', { timeout: 60_000 }, () => {
  it('never moves a booked block and never puts an outdoor block in a wetter hour', () => {
    fc.assert(
      fc.property(dayArb, ([items, hourly, source]) => {
        const day = { ...wednesdayDay(items), rain: { hourly, source } };
        const result = swapDay(wednesdayInput(day), WEDNESDAY);
        if (result === null) throw new Error('the day is there');
        for (const swap of result.swaps) {
          const item = items.find((entry) => entry.stableId === swap.stableId);
          if (item === undefined) throw new Error('a block appeared from nowhere');
          expect(item.locked).toBe(false);
          if (!item.outdoor) continue;
          const before = result.now.find((block) => block.stableId === swap.stableId);
          if (before === undefined) throw new Error('the block was on the day');
          const length = before.end - before.start;
          expect(wettest(hourly, swap.to, swap.to + length)).toBeLessThanOrEqual(
            wettest(hourly, before.start, before.end),
          );
        }
        for (const op of result.ops) {
          expect(items.find((item) => item.stableId === op.target)?.locked).toBe(false);
        }
        expect(result.swapped.map((block) => block.stableId).sort()).toEqual(
          items.map((item) => item.stableId).sort(),
        );
      }),
      { numRuns: 300 },
    );
  });
});
