import { describe, expect, it } from 'vitest';

import { changeSetOpsSchema } from '../../src/plan/change-set-ops';
import { generateStableId } from '../../src/plan/plan-item';

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
});
