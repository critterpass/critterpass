import {
  applyPlanEdits,
  planOpsToEdits,
  type PlanOp,
  type PlanState,
  type PlanStateItem,
} from '@cp/domain';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { changedSince, rebaseOps, sameItem } from '../../src/ops/rebase';

const DAYS = [1, 2, 3, 4].map((dayNo) => ({
  day_no: dayNo,
  date: `2027-04-0${dayNo + 4}`,
  theme: `Day ${dayNo}`,
}));
const id = (n: number) => `0195f000-0000-7000-8000-${String(n).padStart(12, '0')}`;
const at = (dayNo: number, hour: number) =>
  `2027-04-0${dayNo + 4}T${String(hour).padStart(2, '0')}:00:00+09:00`;

function baseState(count: number): PlanState {
  return {
    days: DAYS,
    items: Array.from({ length: count }, (_, i): PlanStateItem => {
      const dayNo = (i % 4) + 1;
      return {
        stable_id: id(i + 1),
        day_no: dayNo,
        starts_at: at(dayNo, 9 + (i % 5)),
        ends_at: at(dayNo, 10 + (i % 5)),
        tz: 'Asia/Tokyo',
        category: 'activity',
      };
    }),
  };
}

/** One op on item `target` (an existing stable id) or a fresh add. */
const opOn = (target: string, fresh: string): fc.Arbitrary<PlanOp> =>
  fc.oneof(
    fc
      .record({ day: fc.integer({ min: 1, max: 4 }), hour: fc.integer({ min: 7, max: 17 }) })
      .map(({ day, hour }): PlanOp => ({
        op: 'move',
        item: target,
        new: { day_no: day, starts_at: at(day, hour), ends_at: at(day, hour + 1) },
      })),
    fc.constant<PlanOp>({ op: 'remove', item: target }),
    fc.integer({ min: 1, max: 4 }).map((day): PlanOp => ({
      op: 'add',
      item: fresh,
      new: { day_no: day, starts_at: at(day, 12), ends_at: at(day, 13), category: 'meal' },
    })),
  );

function sameState(a: PlanState, b: PlanState): boolean {
  if (a.items.length !== b.items.length) return false;
  const byId = new Map(b.items.map((item) => [item.stable_id, item]));
  return a.items.every((item) => {
    const other = byId.get(item.stable_id);
    return other !== undefined && sameItem(item, other);
  });
}

describe('plan op rebase', { timeout: 60_000 }, () => {
  it('converges: ops on disjoint items rebase unchanged and commute in either order', () => {
    fc.assert(
      fc.property(
        fc
          .integer({ min: 2, max: 7 })
          .chain((cut) =>
            fc.tuple(
              fc.tuple(...Array.from({ length: cut }, (_, i) => opOn(id(i + 1), id(100 + i)))),
              fc.tuple(
                ...Array.from({ length: 8 - cut }, (_, i) => opOn(id(cut + i + 1), id(200 + i))),
              ),
            ),
          ),
        ([mine, theirs]) => {
          const base = baseState(8);
          const a = planOpsToEdits(mine);
          const b = planOpsToEdits(theirs);
          const afterA = applyPlanEdits(base, a);
          const afterB = applyPlanEdits(base, b);
          const rebasedB = rebaseOps(theirs, b, base, afterA);
          const rebasedA = rebaseOps(mine, a, base, afterB);
          expect(rebasedB.ok && rebasedA.ok).toBe(true);
          expect(sameState(applyPlanEdits(afterA, b), applyPlanEdits(afterB, a))).toBe(true);
        },
      ),
      { numRuns: 50 },
    );
  });

  it('reports every item both sides touched as a conflict, never a silent overwrite', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 6 }),
        fc.integer({ min: 7, max: 16 }),
        fc.integer({ min: 7, max: 16 }),
        (n, mineHour, theirHour) => {
          fc.pre(mineHour !== theirHour);
          const base = baseState(6);
          const target = id(n);
          const move = (hour: number): PlanOp[] => [
            {
              op: 'resize',
              item: target,
              new: { starts_at: at(1, hour), ends_at: at(1, hour + 1) },
            },
          ];
          const latest = applyPlanEdits(base, planOpsToEdits(move(theirHour)));
          // Their op must actually change the item (a no-op leaves nothing to conflict with).
          fc.pre(changedSince(base, latest).size > 0);
          const result = rebaseOps(move(mineHour), planOpsToEdits(move(mineHour)), base, latest);
          expect(result).toEqual({ ok: false, conflicts: [target] });
        },
      ),
      { numRuns: 50 },
    );
  });

  it('treats a day reorder as conflicting with any concurrent edit', () => {
    const base = baseState(4);
    const reorder: PlanOp[] = [{ op: 'reorder_days', new: { order: [2, 1, 3, 4] } }];
    const latest = applyPlanEdits(base, planOpsToEdits(reorder));
    expect(changedSince(base, latest).has('days')).toBe(true);
    const mine: PlanOp[] = [{ op: 'remove', item: id(4) }];
    expect(rebaseOps(mine, planOpsToEdits(mine), base, latest)).toEqual({
      ok: false,
      conflicts: ['days'],
    });
  });

  it('keeps local times when a reorder moves a day to another date', () => {
    const base = baseState(2);
    const moved = applyPlanEdits(
      base,
      planOpsToEdits([{ op: 'reorder_days', new: { order: [2, 1, 3, 4] } }]),
    );
    const second = moved.items.find((item) => item.stable_id === id(2));
    expect(second?.day_no).toBe(1);
    expect(new Date(second?.starts_at ?? '').toISOString()).toBe(new Date(at(1, 10)).toISOString());
    expect(moved.days.map((day) => day.theme)).toEqual(['Day 2', 'Day 1', 'Day 3', 'Day 4']);
  });
});
