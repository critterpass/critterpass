/**
 * Pushes on the phone: an edit's push names every other stop it moves with the time it had; taking
 * the stop off puts exactly those back, and only while each still sits where the push left it.
 */
import { describe, expect, it } from '@jest/globals';

import type { PlanOp, PlanPush, PlanState } from '@cp/domain';

import { pushedBackOps, pushOf } from '../plan-pushes';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const at = (time: string) => `2026-10-20T${time}:00.000Z`;
const SPA = id(1);
const TEMPLE = id(2);
const LUNCH = id(3);

const later = (time: string) =>
  `${String(Number(time.slice(0, 2)) + 1).padStart(2, '0')}:${String(Number(time.slice(3)) + 30).padStart(2, '0')}`;
const state = (temple: string, lunch: string): PlanState => ({
  days: [{ day_no: 2, date: '2026-10-20', theme: null }],
  items: [
    { stable_id: SPA, day_no: 2, starts_at: at('01:30'), ends_at: at('02:55') },
    {
      stable_id: TEMPLE,
      day_no: 2,
      starts_at: at(temple),
      ends_at: at(later(temple)),
    },
    { stable_id: LUNCH, day_no: 2, starts_at: at(lunch), ends_at: at('09:00') },
  ],
});
const move = (item: string, from: string, to: string): PlanOp => ({
  op: 'move',
  item,
  new: { starts_at: at(from), ends_at: at(to) },
});

describe('pushes on the phone', () => {
  it('names every other stop an edit moves, with the time it had', () => {
    const before = state('02:00', '05:15');
    const push = pushOf(SPA, [move(SPA, '01:30', '02:55'), move(TEMPLE, '03:05', '04:30')], before);
    expect(push).toEqual({
      cause: SPA,
      items: [{ stable_id: TEMPLE, from: { starts_at: at('02:00'), ends_at: at('03:30') } }],
    });
    expect(pushOf(SPA, [move(SPA, '01:30', '02:55')], before)).toBe(undefined);
  });

  it('puts the pushed stops back exactly, and not once one has moved since', () => {
    const records: PlanPush[] = [
      {
        cause: SPA,
        items: [
          {
            stable_id: TEMPLE,
            from: { starts_at: at('02:00'), ends_at: at('03:30') },
            to: { starts_at: at('03:05'), ends_at: at('04:35') },
          },
        ],
      },
    ];
    expect(pushedBackOps(records, SPA, state('03:05', '05:15'))).toEqual([
      { op: 'move', item: TEMPLE, new: { starts_at: at('02:00'), ends_at: at('03:30') } },
    ]);
    expect(pushedBackOps(records, SPA, state('03:20', '05:15'))).toBe(null);
    expect(pushedBackOps(records, LUNCH, state('03:05', '05:15'))).toBe(null);
  });
});
