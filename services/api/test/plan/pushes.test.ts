/**
 * Which pushes a new plan version keeps: an edit's own push is stamped with where each stop now
 * sits; a record lives on while its cause stop exists and every stop it pushed is still where the
 * push left it, and ends with a hand edit, a move to another day or the cause going.
 */
import type { PlanPush, PlanState } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import { carryPushes, readPushes } from '../../src/plan/pushes';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const at = (time: string) => `2026-10-20T${time}:00+08:00`;
const SPA = id(1);
const TEMPLE = id(2);
const LUNCH = id(3);

const state = (
  temple: string,
  lunch: string,
  extra: Partial<Record<string, number>> = {},
): PlanState => ({
  days: [
    { day_no: 2, date: '2026-10-20', theme: null },
    { day_no: 3, date: '2026-10-21', theme: null },
  ],
  items: [
    { stable_id: SPA, day_no: 2, starts_at: at('09:30'), ends_at: at('10:55') },
    { stable_id: TEMPLE, day_no: extra.temple ?? 2, starts_at: at(temple), ends_at: at('15:35') },
    { stable_id: LUNCH, day_no: 2, starts_at: at(lunch), ends_at: at('18:05') },
  ],
});

const before = state('10:00', '13:15');
const after = state('14:05', '17:20');
const push: PlanPush = {
  cause: SPA,
  items: [
    { stable_id: TEMPLE, from: { starts_at: at('10:00'), ends_at: at('11:30') } },
    { stable_id: LUNCH, from: { starts_at: at('13:15'), ends_at: at('14:00') } },
  ],
};

describe('carrying pushes to a new version', () => {
  it('stamps an edit’s own push with where each stop now sits', () => {
    const [kept] = carryPushes([], before, after, push);
    expect(kept?.items.map((item) => item.to?.starts_at)).toEqual([at('14:05'), at('17:20')]);
  });

  it('keeps a record while nothing it pushed has moved since', () => {
    const records = carryPushes([], before, after, push);
    expect(carryPushes(records, after, after, null)).toEqual(records);
  });

  it('ends a record when a pushed stop is edited by hand, moves day, or the cause goes', () => {
    const records = carryPushes([], before, after, push);
    expect(carryPushes(records, after, state('15:00', '17:20'), null)).toEqual([]);
    expect(carryPushes(records, after, state('14:05', '17:20', { temple: 3 }), null)).toEqual([]);
    const noSpa = { ...after, items: after.items.filter((item) => item.stable_id !== SPA) };
    expect(carryPushes(records, after, noSpa, null)).toEqual([]);
  });

  it('drops stops the edit did not actually move, and reads a bad stored value as none', () => {
    expect(carryPushes([], before, before, push)).toEqual([]);
    expect(readPushes({ not: 'a list' })).toEqual([]);
    expect(readPushes(null)).toEqual([]);
  });
});
