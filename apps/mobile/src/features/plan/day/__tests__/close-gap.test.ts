/**
 * Taking a stop off a day that an earlier add pushed late: the stops after it go back earlier by
 * what it freed, never before the stop ahead of them is done, never to a worse time of day for
 * their kind, and never when they are booked or a must-do. A day whose stops are where they belong
 * is left exactly as it is.
 */
import { describe, expect, it } from '@jest/globals';

import type { DayItem, LockKind } from '@/data/plan/plan-model';
import { minutesOnDay } from '@/data/plan/plan-model';

import { closeGap, outOfPlaceOn } from '../close-gap';

const DATE = '2026-10-20';
const TZ = 'Asia/Makassar';
const SLOT = { dayNo: 2, date: DATE };
const UBUD = { lat: -8.5069, lng: 115.2625 };
const at = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const TEN_MINUTES = () => 10;
const outOfPlace = outOfPlaceOn(DATE, TZ);

function stop(
  id: string,
  category: string,
  start: string,
  end: string,
  lock: LockKind | null = null,
): DayItem {
  return {
    stableId: id,
    dayNo: 2,
    title: id,
    category,
    start: at(start),
    end: at(end),
    tz: TZ,
    lane: null,
    attendeeIds: [],
    lock,
    status: 'confirmed',
    byGuide: true,
    notes: null,
    poiId: null,
    place: UBUD,
    amountMinor: null,
    currency: null,
    costModel: null,
    bookingId: null,
  };
}

/** The new local start of each moved stop, by id. */
function startsOf(result: ReturnType<typeof closeGap>): Record<string, string> {
  return Object.fromEntries(
    result.ops.flatMap((op) => {
      if (op.op !== 'move' || op.new.starts_at === undefined) return [];
      const minutes = minutesOnDay(op.new.starts_at, TZ, DATE);
      const clock = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
      return [[op.item, clock]];
    }),
  );
}

// A Tuesday an added spa pushed late: lunch at ten to three, a temple still in daylight, and the
// monkey forest after dark.
const spa = stop('spa', 'wellness', '09:30', '10:55');
const lunch = stop('Warung lunch', 'food', '14:50', '15:35');
const temple = stop('temple', 'temple_shrine', '16:00', '17:00');
const forest = stop('forest', 'nature', '20:25', '21:25');

describe('taking a stop off a day that was pushed late', () => {
  it('moves the stops that sit too late back by what it freed, and leaves the rest', () => {
    const result = closeGap([spa, lunch, temple, forest], 'spa', SLOT, TEN_MINUTES, outOfPlace);
    expect(startsOf(result)).toEqual({ 'Warung lunch': '13:25', forest: '19:00' });
    expect(result).toMatchObject({ moved: 2, movedBy: 85 });
  });

  it('never starts a stop before the one ahead of it is done and the way there', () => {
    const massage = stop('massage', 'wellness', '16:00', '18:55');
    const result = closeGap([spa, lunch, massage, forest], 'spa', SLOT, TEN_MINUTES, outOfPlace);
    // The massage runs until 18:55: the forest can only go back to 19:05.
    expect(startsOf(result)).toMatchObject({ forest: '19:05' });
  });

  it('never moves a booked stop or a must-do', () => {
    const booked = { ...lunch, lock: 'booking' as const };
    const mustDo = { ...forest, lock: 'must_do' as const };
    expect(
      closeGap([spa, booked, temple, mustDo], 'spa', SLOT, TEN_MINUTES, outOfPlace).ops,
    ).toEqual([]);
  });

  it('does not pull a dinner into the afternoon', () => {
    const dinner = stop('Warung dinner', 'food', '18:30', '19:30');
    const result = closeGap([spa, lunch, dinner], 'spa', SLOT, TEN_MINUTES, outOfPlace);
    expect(startsOf(result)).toEqual({ 'Warung lunch': '13:25' });
  });
});

describe('a day whose stops are where they belong', () => {
  it('is left exactly as it is when a stop comes off', () => {
    const day = [
      stop('spa', 'wellness', '10:00', '11:25'),
      stop('Warung lunch', 'food', '12:30', '13:15'),
      stop('museum', 'museum', '14:00', '15:30'),
      stop('Warung dinner', 'food', '18:30', '19:30'),
    ];
    expect(closeGap(day, 'spa', SLOT, TEN_MINUTES, outOfPlace)).toEqual({
      ops: [],
      moved: 0,
      movedBy: null,
    });
  });
});
