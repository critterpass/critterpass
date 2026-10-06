import { describe, expect, it } from 'vitest';

import { changeSetOpsSchema, isAssignProviderOp, planItemOps } from '../../src/plan/change-set-ops';
import { generateStableId } from '../../src/plan/plan-item';
import { changeSetOpsToEdits } from '../../src/plan/plan-ops';

describe('changeSetOpsSchema', () => {
  it('accepts one op per documented kind with a structural before/after snapshot', () => {
    const target = generateStableId();
    const result = changeSetOpsSchema.safeParse([
      {
        op: 'retime',
        target,
        before: { starts_at: '2027-01-10T09:00:00+07:00' },
        after: { starts_at: '2027-01-10T10:00:00+07:00', day_no: 2 },
        reason: 'moved to avoid the rain',
        affected_user_ids: [],
        booking_impact: false,
      },
    ]);
    expect(result.success).toBe(true);
  });

  it('rejects an empty ops array', () => {
    expect(changeSetOpsSchema.safeParse([]).success).toBe(false);
  });

  it('rejects an unknown op kind', () => {
    const result = changeSetOpsSchema.safeParse([
      {
        op: 'teleport',
        target: generateStableId(),
        reason: 'x',
        affected_user_ids: [],
        booking_impact: false,
      },
    ]);
    expect(result.success).toBe(false);
  });

  it('rejects a snapshot with an out-of-vocabulary cost_model', () => {
    const result = changeSetOpsSchema.safeParse([
      {
        op: 'swap',
        target: generateStableId(),
        after: { cost_model: 'crowdfunded' },
        reason: 'x',
        affected_user_ids: [],
        booking_impact: true,
      },
    ]);
    expect(result.success).toBe(false);
  });

  it('requires a non-empty reason', () => {
    const result = changeSetOpsSchema.safeParse([
      {
        op: 'remove',
        target: generateStableId(),
        reason: '',
        affected_user_ids: [],
        booking_impact: false,
      },
    ]);
    expect(result.success).toBe(false);
  });
  describe('assign_provider', () => {
    const pick = {
      op: 'assign_provider',
      target: generateStableId(),
      assignment: {
        days: [
          { date: '2027-01-10', window_start: '06:30', window_end: '18:00', pickup: 'Villa gate' },
          { date: '2027-01-11', window_start: null, window_end: null, pickup: null },
        ],
        terms: {
          price_minor: 65_000_000,
          currency: 'IDR',
          price_unit: 'day',
          included_hours: 10,
          includes: { fuel: 'yes' },
          overtime_minor: null,
        },
      },
      reason: 'our driver for these days',
      affected_user_ids: [],
      booking_impact: false,
    };
    const retime = {
      op: 'retime',
      target: generateStableId(),
      after: { starts_at: '2027-01-10T10:00:00+07:00' },
      reason: 'later',
      affected_user_ids: [],
      booking_impact: false,
    };

    it('accepts a pick with days and terms, alone or next to plan changes', () => {
      expect(changeSetOpsSchema.safeParse([pick]).success).toBe(true);
      const { terms: _terms, ...daysOnly } = pick.assignment;
      expect(
        changeSetOpsSchema.safeParse([{ ...pick, assignment: daysOnly }, retime]).success,
      ).toBe(true);
    });

    it('rejects a pick without days, with a day twice, or with plan item fields', () => {
      const { assignment: _assignment, ...bare } = pick;
      const twice = {
        ...pick.assignment,
        days: [pick.assignment.days[0], pick.assignment.days[0]],
      };
      for (const op of [
        bare,
        { ...pick, assignment: { ...pick.assignment, days: [] } },
        { ...pick, assignment: twice },
        { ...pick, after: { day_no: 2 } },
        { ...pick, assignment: { ...pick.assignment, driver: 'someone else' } },
      ]) {
        expect(changeSetOpsSchema.safeParse([op]).success).toBe(false);
      }
    });

    it('rejects an assignment on a plan item change', () => {
      expect(
        changeSetOpsSchema.safeParse([{ ...retime, assignment: pick.assignment }]).success,
      ).toBe(false);
    });

    it('is left out of the plan edits, and out of the plan item ops', () => {
      const ops = changeSetOpsSchema.parse([pick, retime]);
      expect(changeSetOpsToEdits(ops)).toEqual([
        { kind: 'patch', stableId: retime.target, patch: retime.after },
      ]);
      expect(planItemOps(ops).map((op) => op.op)).toEqual(['retime']);
      expect(ops.filter(isAssignProviderOp).map((op) => op.target)).toEqual([pick.target]);
    });
  });
});
