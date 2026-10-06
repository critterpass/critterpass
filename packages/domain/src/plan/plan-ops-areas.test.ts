import { describe, expect, it } from 'vitest';

import { applyPlanEdits, type PlanState } from './plan-ops';

const AREA = '0199a000-0000-7000-8000-000000000001';
const STOP = '0199a000-0000-7000-8000-0000000000aa';

const plan = (area: boolean): PlanState => ({
  days: [
    { day_no: 1, date: '2027-03-01', theme: 'Old town' },
    {
      day_no: 2,
      date: '2027-03-02',
      theme: 'Machu Picchu',
      ...(area ? { destination_id: AREA } : {}),
    },
    { day_no: 3, date: '2027-03-03', theme: 'Markets' },
  ],
  items: [
    {
      stable_id: STOP,
      day_no: 2,
      category: 'sightseeing',
      starts_at: '2027-03-02T14:00:00.000Z',
      ends_at: '2027-03-02T17:00:00.000Z',
      tz: 'America/Lima',
    },
  ],
});

describe("a day's area in the plan state", () => {
  it('moves with the day it belongs to when the days are reordered', () => {
    const next = applyPlanEdits(plan(true), [{ kind: 'reorder_days', order: [2, 1, 3] }]);
    expect(next.days).toEqual([
      { day_no: 1, date: '2027-03-01', theme: 'Machu Picchu', destination_id: AREA },
      { day_no: 2, date: '2027-03-02', theme: 'Old town' },
      { day_no: 3, date: '2027-03-03', theme: 'Markets' },
    ]);
    expect(next.items[0]?.day_no).toBe(1);
  });

  it('stays on its day through an add, a move and a removal', () => {
    const next = applyPlanEdits(plan(true), [
      { kind: 'patch', stableId: STOP, patch: { starts_at: '2027-03-02T15:00:00.000Z' } },
      {
        kind: 'add',
        item: { stable_id: '0199a000-0000-7000-8000-0000000000bb', day_no: 3, category: 'food' },
      },
      { kind: 'remove', stableId: STOP },
    ]);
    expect(next.days[1]).toEqual({
      day_no: 2,
      date: '2027-03-02',
      theme: 'Machu Picchu',
      destination_id: AREA,
    });
  });

  it('leaves a plan with no areas exactly as before', () => {
    const next = applyPlanEdits(plan(false), [{ kind: 'reorder_days', order: [3, 2, 1] }]);
    expect(JSON.stringify(next.days)).toBe(
      JSON.stringify([
        { day_no: 1, date: '2027-03-01', theme: 'Markets' },
        { day_no: 2, date: '2027-03-02', theme: 'Machu Picchu' },
        { day_no: 3, date: '2027-03-03', theme: 'Old town' },
      ]),
    );
  });
});
