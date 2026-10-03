import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { checkPlan, DEFAULT_CHECK_THRESHOLDS } from '../../src/check/index';
import type { FitItem } from '../../src/fit/index';
import { at, TZ, VILLA } from '../fit/bali-fixture';

const PEOPLE = [
  '00000000-0000-4000-8000-00000000a001',
  '00000000-0000-4000-8000-00000000a002',
  '00000000-0000-4000-8000-00000000a003',
];
const stable = (n: number) => `00000000-0000-4000-8000-00000000e${String(n).padStart(3, '0')}`;
const clock = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

const itemArb = (index: number) =>
  fc
    .record({
      startQ: fc.integer({ min: 28, max: 84 }),
      lengthQ: fc.integer({ min: 1, max: 12 }),
      who: fc.subarray(PEOPLE),
      locked: fc.boolean(),
      d: fc.integer({ min: -40, max: 40 }),
    })
    .map((raw): FitItem => ({
      stableId: stable(index),
      poiId: null,
      category: 'other',
      startsAt: at(17, clock(raw.startQ * 15)),
      endsAt: at(17, clock(Math.min(raw.startQ + raw.lengthQ, 95) * 15)),
      attendeeIds: raw.who,
      locked: raw.locked,
      outdoor: false,
      point: { lat: VILLA.lat + raw.d / 1000, lng: VILLA.lng - raw.d / 1000 },
    }));

const dayArb = fc
  .integer({ min: 2, max: 8 })
  .chain((count) => fc.tuple(...Array.from({ length: count }, (_, i) => itemArb(i))));

describe('plan check properties', { timeout: 60_000 }, () => {
  it('a one-tap fix never moves a booked or locked item', () => {
    fc.assert(
      fc.property(dayArb, (items) => {
        const issues = checkPlan({
          context: {
            tz: TZ,
            participants: PEOPLE,
            driveFactor: 1,
            days: [
              {
                dayId: '00000000-0000-4000-8000-00000000c001',
                dayNo: 1,
                date: '2026-10-17',
                kind: 'full',
                fromMin: 7 * 60,
                toMin: 22 * 60,
                items,
                stay: VILLA,
                rain: null,
                crowdFactor: 1,
              },
            ],
          },
          places: new Map(),
          bookings: [],
          thresholds: DEFAULT_CHECK_THRESHOLDS,
          now: new Date('2026-10-01T00:00:00Z'),
        });
        const locked = new Set(items.filter((item) => item.locked).map((item) => item.stableId));
        for (const issue of issues) {
          if (issue.fix?.kind !== 'apply') continue;
          for (const op of issue.fix.ops) expect(locked.has(op.target)).toBe(false);
        }
      }),
      { numRuns: 400 },
    );
  });
});
