/**
 * Placing ideas on the Bali crew's days: six ideas fit without moving anything and are placed,
 * the scarcest first; the one the crew is split on and the one that only fits by moving a stop are
 * left for the person with why. Properties: nothing already in the plan moves or is overlapped by a
 * locked-out slot, a split idea is never placed, a day never goes past the pace limit, and the
 * same ideas in any order give the same answer.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import type { FitContext, FitItem } from '../../src/fit/index';
import { placeIdeas, type PlacementIdea } from '../../src/placement/index';
import { at, BALI, daily, VILLA } from '../fit/bali-fixture';
import { EIGHT, idea, near, place } from './bali-ideas';

describe('placeIdeas', () => {
  it('places six of the eight Bali ideas and leaves two for the person, with why', () => {
    const result = placeIdeas(BALI, EIGHT);
    expect(result.placed.map((p) => p.ideaId).sort()).toEqual([1, 2, 3, 4, 5, 6].map(idea).sort());
    expect(result.left.map((l) => [l.ideaId, l.reason])).toEqual([
      [idea(7), 'split'],
      [idea(8), 'no_day'],
    ]);
    expect(result.left[0]?.reasons.map((r) => r.code)).toEqual(['crew_split']);
    for (const stop of result.placed) {
      expect(stop.number).toBeGreaterThan(0);
      expect(stop.reasons.length).toBeGreaterThan(0);
    }
  });

  it('sends the scarcest idea first: the one with a single free day gets it', () => {
    const saturdayOnly = place(12, {
      hours: { weekly: { sa: [{ start: '09:00', end: '12:00' }] } },
      timeNeededMin: 150,
    });
    const twoDays = place(11, { hours: daily('09:00', '18:00'), timeNeededMin: 150 });
    const result = placeIdeas(BALI, [
      { ideaId: idea(11), place: twoDays },
      { ideaId: idea(12), place: saturdayOnly },
    ]);
    expect(result.placed.find((p) => p.ideaId === idea(12))?.dayNo).toBe(5);
    expect(result.placed.find((p) => p.ideaId === idea(11))).toBeDefined();
    expect(result.left).toEqual([]);
  });

  it('leaves an idea that only fits by moving a stop, naming the stop', () => {
    const busy: FitContext = {
      ...BALI,
      days: BALI.days.map((day) =>
        day.dayNo === 5
          ? {
              ...day,
              items: [
                {
                  stableId: idea(99),
                  poiId: null,
                  category: 'other',
                  startsAt: at(17, '08:00'),
                  endsAt: at(17, '21:00'),
                  attendeeIds: [],
                  locked: false,
                  outdoor: false,
                  point: VILLA,
                },
              ],
            }
          : day,
      ),
    };
    const saturdayOnly = place(11, {
      hours: { weekly: { sa: [{ start: '09:00', end: '12:00' }] } },
    });
    const result = placeIdeas(busy, [{ ideaId: idea(11), place: saturdayOnly }]);
    expect(result.placed).toEqual([]);
    expect(result.left[0]).toMatchObject({ reason: 'needs_move', dayNo: 5, needsMove: idea(99) });
  });
});

const itemsOf = (context: FitContext): Map<string, FitItem> =>
  new Map(context.days.flatMap((day) => day.items.map((item) => [item.stableId, item])));

const ideaArb = (n: number) =>
  fc
    .record({
      openQ: fc.integer({ min: 28, max: 52 }),
      lengthQ: fc.integer({ min: 8, max: 40 }),
      visitQ: fc.integer({ min: 2, max: 10 }),
      dLat: fc.integer({ min: -40, max: 40 }),
      dLng: fc.integer({ min: -40, max: 40 }),
      split: fc.boolean(),
    })
    .map((raw): PlacementIdea => {
      const clock = (q: number) =>
        `${String(Math.floor(Math.min(q, 95) / 4)).padStart(2, '0')}:${String((Math.min(q, 95) % 4) * 15).padStart(2, '0')}`;
      return {
        ideaId: idea(100 + n),
        place: place(100 + n, {
          point: near(raw.dLat / 1000, raw.dLng / 1000),
          hours: daily(clock(raw.openQ), clock(raw.openQ + raw.lengthQ)),
          timeNeededMin: raw.visitQ * 15,
          stances: raw.split ? { want: 2, ratherNot: 1 } : null,
        }),
      };
    });

const ideasArb = fc
  .integer({ min: 1, max: 9 })
  .chain((count) => fc.tuple(...Array.from({ length: count }, (_, i) => ideaArb(i))));

describe('placeIdeas properties', { timeout: 60_000 }, () => {
  it('never moves or overlaps a locked stop, never places a split idea, keeps the pace', () => {
    fc.assert(
      fc.property(ideasArb, fc.integer({ min: 2, max: 7 }), (ideas, limit) => {
        const result = placeIdeas(BALI, ideas, { maxStopsPerDay: limit });
        const before = itemsOf(BALI);
        const after = itemsOf(result.context);
        for (const [id, item] of before) expect(after.get(id)).toEqual(item);
        const split = new Set(ideas.filter((i) => i.place.stances).map((i) => i.ideaId));
        for (const stop of result.placed) {
          expect(split.has(stop.ideaId)).toBe(false);
          const day = BALI.days.find((d) => d.dayId === stop.dayId)!;
          for (const item of day.items.filter((i) => i.locked)) {
            const overlaps = stop.startsAt < item.endsAt && item.startsAt < stop.endsAt;
            expect(overlaps).toBe(false);
          }
        }
        for (const day of result.context.days) {
          const original = BALI.days.find((d) => d.dayId === day.dayId)!.items.length;
          expect(day.items.length).toBeLessThanOrEqual(Math.max(limit, original));
        }
        expect(result.placed.length + result.left.length).toBe(ideas.length);
      }),
      { numRuns: 60 },
    );
  });

  it('gives the same answer for the same ideas in any order', () => {
    fc.assert(
      fc.property(
        ideasArb.chain((ideas) =>
          fc.tuple(fc.constant(ideas), fc.shuffledSubarray(ideas, { minLength: ideas.length })),
        ),
        ([ideas, shuffled]) => {
          const a = placeIdeas(BALI, ideas);
          const b = placeIdeas(BALI, shuffled);
          expect(b.placed).toEqual(a.placed);
          expect(b.left).toEqual(a.left);
        },
      ),
      { numRuns: 40 },
    );
  });
});
