import { type ChangeSetOp, type PlanState } from '@cp/domain';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { mergeOverlay, type OverlayRow } from '../../src/overlay/merge';

const ME = '0195f000-0000-7000-8000-00000000aaaa';
const id = (n: number) => `0195f000-0000-7000-8000-${String(n).padStart(12, '0')}`;
const at = (hour: number) => `2027-04-05T${String(hour).padStart(2, '0')}:00:00.000Z`;

const GROUP: PlanState = {
  days: [{ day_no: 1, date: '2027-04-05', theme: null }],
  items: [1, 2, 3].map((n) => ({
    stable_id: id(n),
    day_no: 1,
    starts_at: at(8 + n * 2),
    ends_at: at(9 + n * 2),
    category: 'activity',
  })),
};

const base = { reason: 'just me', affected_user_ids: [ME], booking_impact: false };
const retime = (n: number, hour: number, beforeHour = 8 + n * 2): ChangeSetOp => ({
  ...base,
  op: 'retime',
  target: id(n),
  before: { day_no: 1, starts_at: at(beforeHour), ends_at: at(beforeHour + 1) },
  after: { starts_at: at(hour), ends_at: at(hour + 1) },
});
const row = (ops: ChangeSetOp[], status: OverlayRow['status'] = 'active'): OverlayRow => ({
  id: id(900),
  ops,
  status,
});

describe('personal overlay', { timeout: 60_000 }, () => {
  it('hides a skipped item, tags my own items and leaves the group plan alone', () => {
    const snapshot = structuredClone(GROUP);
    const plan = mergeOverlay(
      GROUP,
      [
        row([
          { ...base, op: 'remove', target: id(1) },
          retime(2, 15),
          { ...base, op: 'add', target: id(4), after: { day_no: 1, starts_at: at(18) } },
        ]),
      ],
      ME,
    );
    expect(plan.skipped).toEqual([id(1)]);
    expect(plan.items.map((i) => [i.stable_id, i.just_you])).toEqual([
      [id(2), true],
      [id(3), false],
      [id(4), true],
    ]);
    expect(plan.items.find((i) => i.stable_id === id(2))?.starts_at).toBe(at(15));
    expect(plan.items.find((i) => i.stable_id === id(4))?.attendee_ids).toEqual([ME]);
    expect(plan.clashes).toEqual([]);
    expect(GROUP).toEqual(snapshot);
  });

  it('marks a clash when the crew moved or removed an item I changed', () => {
    const moved: PlanState = {
      ...GROUP,
      items: GROUP.items.map((i) => (i.stable_id === id(2) ? { ...i, starts_at: at(11) } : i)),
    };
    expect(mergeOverlay(moved, [row([retime(2, 15)])], ME).clashes).toEqual([
      { personalOpsId: id(900), stableId: id(2), kind: 'changed_by_crew' },
    ]);
    const removed: PlanState = {
      ...GROUP,
      items: GROUP.items.filter((i) => i.stable_id !== id(2)),
    };
    const plan = mergeOverlay(removed, [row([retime(2, 15)])], ME);
    expect(plan.clashes.map((c) => c.kind)).toEqual(['removed_by_crew']);
    expect(plan.items.find((i) => i.stable_id === id(2))).toMatchObject({
      just_you: true,
      starts_at: at(15),
    });
  });

  it('ignores dropped rows and rejected changes', () => {
    const plan = mergeOverlay(
      GROUP,
      [row([retime(1, 16)], 'dropped'), row([{ ...retime(3, 16), accepted: false }])],
      ME,
    );
    expect(plan.items.every((i) => !i.just_you)).toBe(true);
  });

  it('keeps every item exactly once and never touches the group input', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            n: fc.integer({ min: 1, max: 4 }),
            kind: fc.constantFrom('remove', 'retime', 'add'),
            hour: fc.integer({ min: 7, max: 20 }),
          }),
          { maxLength: 8 },
        ),
        (specs) => {
          const snapshot = structuredClone(GROUP);
          const ops = specs.map(({ n, kind, hour }): ChangeSetOp =>
            kind === 'remove'
              ? { ...base, op: 'remove', target: id(n) }
              : kind === 'add'
                ? {
                    ...base,
                    op: 'add',
                    target: id(10 + n),
                    after: { day_no: 1, starts_at: at(hour) },
                  }
                : retime(n, hour),
          );
          const plan = mergeOverlay(GROUP, [row(ops)], ME);
          const ids = plan.items.map((i) => i.stable_id);
          expect(new Set(ids).size).toBe(ids.length);
          expect(ids.some((i) => plan.skipped.includes(i))).toBe(false);
          expect(GROUP).toEqual(snapshot);
        },
      ),
      { numRuns: 100 },
    );
  });
});
