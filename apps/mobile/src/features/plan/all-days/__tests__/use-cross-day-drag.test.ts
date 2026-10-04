/**
 * Dragging a stop between days on all days: the card under the finger, what a drop means (nothing
 * on its own day or between cards; a booked stop stays), and the move: the stop keeps its time on
 * the new day, the day makes room after it, and both days are read again for the preview.
 */
import { tokens } from '@cp/design-tokens';
import { describe, expect, it } from '@jest/globals';

import type { DayItem } from '@/data/plan/plan-model';

import type { TripDay } from '../../trip-map/trip-days';
import { dayAt, dropOutcome, planMove } from '../use-cross-day-drag';

const RECTS = [
  { dayNo: 1, x: 16, y: 300, width: 170, height: 140 },
  { dayNo: 2, x: 196, y: 300, width: 170, height: 140 },
  { dayNo: 3, x: 16, y: 450, width: 170, height: 140 },
];

function stop(id: string, dayNo: number, start: number, end: number, booked = false): DayItem {
  return {
    stableId: id,
    dayNo,
    title: id,
    category: 'nature',
    start,
    end,
    tz: 'Asia/Makassar',
    lane: null,
    attendeeIds: [],
    lock: booked ? 'booking' : null,
    status: 'confirmed',
    byGuide: false,
    notes: null,
    poiId: null,
    place: { lat: -8.5, lng: 115.26 },
    amountMinor: null,
    currency: null,
    costModel: null,
    bookingId: booked ? `b-${id}` : null,
  };
}

function day(dayNo: number, date: string, stops: readonly DayItem[]): TripDay {
  return {
    dayNo,
    dayId: `day-${dayNo}`,
    date,
    theme: null,
    color: tokens.color.green.base,
    items: stops,
    stops,
    stay: null,
    pace: 1,
    vote: null,
    booked: false,
    issues: [],
    tag: null,
  };
}

describe('cross-day drag', () => {
  it('finds the card under the finger, and none between cards', () => {
    expect(dayAt(RECTS, 100, 350)).toBe(1);
    expect(dayAt(RECTS, 300, 439)).toBe(2);
    expect(dayAt(RECTS, 30, 590)).toBe(3);
    expect(dayAt(RECTS, 190, 350)).toBeNull();
    expect(dayAt(RECTS, 100, 445)).toBeNull();
  });

  it('does nothing when a stop is dropped on its own day or off the cards', () => {
    const walk = stop('walk', 2, 600, 720);
    expect(dropOutcome(walk, 2, 2)).toEqual({ kind: 'none' });
    expect(dropOutcome(walk, 2, null)).toEqual({ kind: 'none' });
    expect(dropOutcome(walk, 2, 6)).toEqual({ kind: 'move', stop: walk, from: 2, to: 6 });
  });

  it('keeps a booked stop on its day', () => {
    const pickup = stop('pickup', 4, 210, 300, true);
    expect(dropOutcome(pickup, 4, 6)).toEqual({
      kind: 'refused',
      refusal: { kind: 'pinned', stop: pickup },
    });
    const tue = day(4, '2026-10-15', [pickup]);
    const sat = day(6, '2026-10-17', []);
    expect(planMove(pickup, tue, sat, () => 0)).toEqual({
      ok: false,
      refusal: { kind: 'pinned', stop: pickup },
    });
  });

  it('moves a stop at its own time and pushes what it now runs into', () => {
    const forest = stop('forest', 2, 9 * 60, 11 * 60);
    const market = stop('market', 2, 16 * 60, 17 * 60);
    const beach = stop('beach', 6, 10 * 60 + 30, 13 * 60);
    const tue = day(2, '2026-10-13', [forest, market]);
    const sat = day(6, '2026-10-17', [beach]);
    const plan = planMove(forest, tue, sat, () => 20);
    if (!plan.ok) throw new Error('the move should fit');
    const moved = plan.ops.find((op) => op.op === 'move' && op.item === 'forest');
    expect(moved).toMatchObject({ op: 'move', item: 'forest', new: { day_no: 6 } });
    // The beach was at 10:30; the forest now runs to 11:00 and the leg is 20 minutes.
    expect(plan.ops.some((op) => op.op === 'move' && op.item === 'beach')).toBe(true);
    expect(plan.to.after.stops.map((one) => one.stableId)).toEqual(['forest', 'beach']);
    expect(plan.from.after.stops.map((one) => one.stableId)).toEqual(['market']);
  });
});
