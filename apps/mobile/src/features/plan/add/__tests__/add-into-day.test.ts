/**
 * A block added at a time the fit did not choose: with nothing to go on it starts after the day's
 * last stop (not on top of the morning), a time that overlaps the stop before it can't be added,
 * and a time that overlaps the stop after it pushes that stop later instead of sitting on it.
 */
import { i18n } from '@lingui/core';
import { beforeAll, describe, expect, it } from '@jest/globals';

import type { PlanState } from '@cp/domain';

import { instantOnDay, minutesOnDay } from '@/data/plan/plan-model';
import type { TripPlan } from '@/data/plan/use-trip-plan';

import { addIntoDay, openStartOn } from '../add-into-day';

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
