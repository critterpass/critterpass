/**
 * Saying "I'm running late" for a stop of today: the push moves the stop and only the stops after
 * it that have to move, a stop that can't move blocks it, and it is hers to make only when the
 * stop is hers alone and she can change the plan.
 */
import { describe, expect, it } from '@jest/globals';

import type { DayItem } from '@/data/plan/plan-model';

import { legTravel } from '../../day-plan/reschedule';
import { lateStep, saidLate } from '../said-late';

const SLOT = { dayNo: 1, date: '2026-10-05' };
const stop = (
  stableId: string,
  start: number,
  end: number,
  extra: Partial<DayItem> = {},
): DayItem => ({
  stableId,
  dayNo: 1,
  title: stableId,
  category: 'activity',
  start,
  end,
  tz: 'Asia/Ho_Chi_Minh',
  lane: null,
  attendeeIds: [],
  lock: null,
  status: 'confirmed',
  byGuide: true,
  notes: null,
  poiId: null,
  place: null,
  amountMinor: null,
  currency: null,
  costModel: null,
  bookingId: null,
  ...extra,
});
const MARKET = stop('market', 14 * 60, 15 * 60);
const NOODLES = stop('noodles', 15 * 60 + 15, 16 * 60 + 30);
const BRIDGE = stop('bridge', 19 * 60, 19 * 60 + 30);
const DAY = [MARKET, NOODLES, BRIDGE];
const base = {
  stops: DAY,
  stop: MARKET,
  minutes: 30,
  slot: SLOT,
  travel: () => 10,
  canApply: true,
  alone: true,
};
describe('saying she is running late', () => {
  it('pushes the stop and only what has to follow', () => {
    const late = saidLate(base);
    expect(late).toMatchObject({ start: 14 * 60 + 30, end: 15 * 60 + 30 });
    expect(late?.effect).toMatchObject({ ok: true, pushed: 1 });
    // The market and the noodles after it move; the bridge, hours later, stays.
    expect(late?.ops).toHaveLength(2);
    expect(JSON.stringify(late?.ops)).not.toContain('bridge');
  });

  it('leaves the stored walk to the next stop whole, never a minute short', () => {
    // The museum 16:15–17:45, the bridge at 18:15, six minutes' walk between them (a stored leg).
    const museum = stop('museum', 16 * 60 + 15, 17 * 60 + 45);
    const bridge = stop('bridge', 18 * 60 + 15, 18 * 60 + 45);
    const late = saidLate({
      ...base,
      stops: [museum, bridge],
      stop: museum,
      minutes: 30,
      travel: legTravel([{ from: 'museum', to: 'bridge', minutes: 6 }]),
    });
    // The museum now ends 18:15: the bridge starts no earlier than 18:21, on the five-minute grid.
    expect(late?.effect).toMatchObject({ ok: true, pushed: 1, pushedBy: 10 });
    expect(JSON.stringify(late?.ops)).toContain('bridge');
  });

  it('moves nothing else when the day has room', () => {
    const late = saidLate({ ...base, minutes: 15, travel: () => 0 });
    expect(late?.effect).toMatchObject({ ok: true, pushed: 0 });
    expect(late?.ops).toHaveLength(1);
  });

  it('is refused, with no moves, when it runs into a stop that keeps its time', () => {
    const booked = { ...NOODLES, lock: 'booking' as const };
    const late = saidLate({ ...base, stops: [MARKET, booked, BRIDGE] });
    expect(late?.effect).toMatchObject({ ok: false, refusal: { kind: 'runs_into' } });
    expect(late?.ops).toEqual([]);
  });

  it('is not hers to push when others go too, the stop is booked, or she cannot change the plan', () => {
    expect(saidLate({ ...base, alone: false })).toBeNull();
    expect(saidLate({ ...base, canApply: false })).toBeNull();
    expect(saidLate({ ...base, stop: { ...MARKET, lock: 'booking' } })).toBeNull();
    expect(saidLate({ ...base, stop: { ...MARKET, start: null, end: null } })).toBeNull();
  });

  it('holds the minutes a link carries to the ones offered', () => {
    expect(lateStep('30')).toBe(30);
    expect(lateStep('45')).toBe(45);
    expect(lateStep('600')).toBe(15);
    expect(lateStep(undefined)).toBe(15);
  });
});
