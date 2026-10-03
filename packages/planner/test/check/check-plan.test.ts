import { checkIssueBodySchema, checkFixSchema } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import { checkPlan } from '../../src/check/index';
import { at } from '../fit/bali-fixture';
import { BALI_CHECK, COOKING, FOREST, LOCAVORE, RIDGE } from './bali-check-fixture';

describe('the plan check on the Bali trip', () => {
  const issues = checkPlan(BALI_CHECK);

  it('finds three to fix and two to know, in the order the check shows them', () => {
    expect(issues.map((issue) => [issue.kind, issue.dayNo])).toEqual([
      ['clash', 1],
      ['too_far', 6],
      ['rain', 2],
      ['pace', 1],
      ['booking_note', null],
    ]);
    expect(issues.map((issue) => issue.severity)).toEqual(['fix', 'fix', 'fix', 'know', 'know']);
    expect(issues.map((issue) => issue.rank)).toEqual([0, 1, 2, 3, 4]);
    for (const issue of issues) {
      expect(
        checkIssueBodySchema.safeParse({ kind: issue.kind, params: issue.params }).success,
      ).toBe(true);
      expect(checkFixSchema.safeParse(issue.fix).success).toBe(true);
    }
  });

  it('fixes the clash in one tap: Monkey Forest at 14:30', () => {
    const clash = issues[0];
    expect(clash?.params).toEqual({ first: COOKING, second: FOREST, short_minutes: 60 });
    expect(clash?.fix).toEqual({
      kind: 'apply',
      ops: [
        expect.objectContaining({
          op: 'retime',
          target: FOREST,
          after: {
            starts_at: at(13, '14:30').toISOString(),
            ends_at: at(13, '15:30').toISOString(),
          },
        }),
      ],
    });
  });

  it('names the long drive, the wet afternoon, the packed day and the hold', () => {
    expect(issues[1]?.params).toEqual({
      drive_minutes: 255,
      limit_minutes: 180,
      longest_leg_minutes: 120,
      after_dark: true,
    });
    expect(issues[1]?.fix).toEqual({ kind: 'screen', screen: 'too_far' });
    expect(issues[2]?.params).toEqual({
      stable_id: RIDGE,
      from: '13:00',
      to: '15:00',
      pct: 55,
      source: 'normals',
    });
    expect(issues[3]?.params).toEqual({ stops: 6, limit: 6 });
    expect(issues[4]?.params).toEqual({
      booking_id: LOCAVORE,
      deadline: new Date('2026-10-01T12:00:00+08:00').toISOString(),
      kind: 'hold_expiry',
    });
  });

  it('keeps an issue identity across runs while the issue holds', () => {
    const again = checkPlan(BALI_CHECK);
    expect(again.map((issue) => issue.fingerprint)).toEqual(
      issues.map((issue) => issue.fingerprint),
    );
    expect(new Set(issues.map((issue) => issue.fingerprint)).size).toBe(issues.length);
  });

  it('lets a fixer screen decide a fix', () => {
    const withFixer = checkPlan({
      ...BALI_CHECK,
      fixers: { too_far: () => ({ kind: 'screen', screen: 'less_driving' }) },
    });
    expect(withFixer[1]?.fix).toEqual({ kind: 'screen', screen: 'less_driving' });
  });
});
