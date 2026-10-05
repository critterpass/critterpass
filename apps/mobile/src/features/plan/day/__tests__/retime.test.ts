/**
 * A new time for one stop, and what is pinned: the stops after it are pushed only as far as they
 * need, the stops before it stay, and a time that would run into the stop ahead, a booked stop or
 * a must-do is refused with the stop in the way. A must-do counts as pinned for a drag too.
 */
import { i18n } from '@lingui/core';
import { beforeAll, describe, expect, it } from '@jest/globals';

import type { DayItem, LockKind } from '@/data/plan/plan-model';
import { minutesOnDay } from '@/data/plan/plan-model';

import { isPinned, moveInOrder, reschedule, retime } from '../../day-plan/reschedule';
import { retimePreview } from '../retime-copy';

const DATE = '2026-10-20';
const TZ = 'Asia/Makassar';
const SLOT = { dayNo: 2, date: DATE };
const at = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));

function stop(id: string, start: string, end: string, lock: LockKind | null = null): DayItem {
  return {
    stableId: id,
    dayNo: 2,
    title: id,
    category: null,
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
    place: null,
    amountMinor: null,
    currency: null,
    costModel: null,
    bookingId: null,
  };
}

const temple = stop('temple', '08:00', '09:30');
const palace = stop('palace', '10:00', '11:00');
const lunch = stop('lunch', '11:15', '12:00');
const museum = stop('museum', '14:00', '15:00');
const DAY = [temple, palace, lunch, museum];
const HALF_HOUR = () => 30;

/** The new local start of each pushed stop, by id. */
function startsOf(result: ReturnType<typeof retime>): Record<string, number> {
  if (!result.ok) return {};
  return Object.fromEntries(
    result.ops.flatMap((op) =>
      op.op === 'move' && op.new.starts_at !== undefined
        ? [[op.item, minutesOnDay(op.new.starts_at, TZ, DATE)]]
        : [],
    ),
  );
}

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
});

describe('what the sheet says before SAVE', () => {
  it('offers the first start that works when the chosen one is taken, and blocks SAVE', () => {
    const taken = retime(
      DAY,
      { stableId: 'palace', start: at('09:00'), end: at('10:00') },
      SLOT,
      HALF_HOUR,
    );
    expect(retimePreview(taken, 'en-GB', null)).toMatchObject({
      blocked: true,
      useStart: at('10:00'),
    });
  });

  it('says how many later stops move, and offers nothing when the time is free', () => {
    const pushed = retime(
      DAY,
      { stableId: 'palace', start: at('11:00'), end: at('12:00') },
      SLOT,
      HALF_HOUR,
    );
    expect(retimePreview(pushed, 'en-GB', null)).toEqual({
      blocked: false,
      line: '1 later stop moves by 1 h',
    });
  });
});

describe('a new time for one stop', () => {
  it('pushes the stops after it only as far as they need, keeping the room they had', () => {
    const result = retime(
      DAY,
      { stableId: 'palace', start: at('11:00'), end: at('12:00') },
      SLOT,
      HALF_HOUR,
    );
    // Lunch had 15 minutes after the palace and keeps 15; the museum's free afternoon absorbs it.
    expect(result).toMatchObject({ ok: true, pushed: 1, pushedBy: 60 });
    expect(startsOf(result)).toEqual({ lunch: at('12:15') });
  });

  it('pushes a later stop by the way between when the free time before it runs out', () => {
    const result = retime(
      DAY,
      { stableId: 'lunch', start: at('13:00'), end: at('13:45') },
      SLOT,
      HALF_HOUR,
    );
    expect(result).toMatchObject({ ok: true, pushed: 1, pushedBy: 15 });
    expect(startsOf(result)).toEqual({ museum: at('14:15') });
  });

  it('moves nothing when the new time still clears its neighbours', () => {
    expect(
      retime(DAY, { stableId: 'lunch', start: at('11:30'), end: at('12:15') }, SLOT, HALF_HOUR),
    ).toMatchObject({ ok: true, pushed: 0, ops: [] });
  });

  it('refuses a start before the stop ahead of it is done, naming the first start that works', () => {
    expect(
      retime(DAY, { stableId: 'palace', start: at('09:00'), end: at('10:00') }, SLOT, HALF_HOUR),
    ).toEqual({
      ok: false,
      refusal: { kind: 'starts_too_early', stop: temple, earliest: at('10:00') },
    });
  });

  it('never pushes a booked stop or a must-do: the change is refused with the stop in the way', () => {
    for (const lock of ['booking', 'must_do'] as const) {
      const fixed = stop('lunch', '11:15', '12:00', lock);
      expect(
        retime(
          [temple, palace, fixed, museum],
          { stableId: 'palace', start: at('11:00'), end: at('12:00') },
          SLOT,
          HALF_HOUR,
        ),
      ).toEqual({ ok: false, refusal: { kind: 'runs_into', stop: fixed } });
    }
  });

  it('times a stop arriving from another day against the day it lands on', () => {
    const arriving = { ...stop('falls', '00:00', '00:00'), start: null, end: null };
    const result = retime(
      [...DAY, arriving],
      { stableId: 'falls', start: at('12:30'), end: at('14:00') },
      SLOT,
      HALF_HOUR,
    );
    expect(result).toMatchObject({ ok: true, pushed: 1 });
    expect(startsOf(result)).toEqual({ museum: at('14:30') });
  });

  it('refuses a day that would run past midnight', () => {
    const late = stop('bar', '22:30', '23:45');
    expect(
      retime(
        [temple, late],
        { stableId: 'temple', start: at('22:00'), end: at('23:30') },
        SLOT,
        HALF_HOUR,
      ),
    ).toEqual({ ok: false, refusal: { kind: 'too_late' } });
  });
});

describe('what is pinned', () => {
  it('holds a must-do like a booking, and leaves a free stop movable', () => {
    expect(isPinned(stop('a', '08:00', '09:00', 'must_do'))).toBe(true);
    expect(isPinned(stop('a', '08:00', '09:00', 'booking'))).toBe(true);
    expect(isPinned(stop('a', '08:00', '09:00', 'user'))).toBe(true);
    expect(isPinned(stop('a', '08:00', '09:00'))).toBe(false);
  });

  it('refuses a drag that would put a stop ahead of a must-do it then runs into', () => {
    const mustDo = stop('temple', '08:00', '09:30', 'must_do');
    const stops = [mustDo, palace, lunch];
    const order = moveInOrder(
      stops.map((entry) => entry.stableId),
      1,
      0,
    );
    expect(reschedule(stops, order, SLOT, HALF_HOUR)).toEqual({
      ok: false,
      refusal: { kind: 'runs_into', stop: mustDo },
    });
  });
});
