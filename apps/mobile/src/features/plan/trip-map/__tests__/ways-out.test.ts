import type { PlanCheckIssue } from '@cp/domain';
import { describe, expect, it } from '@jest/globals';

import { fixerId } from '../use-ways-out';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const tooFar = (fix: PlanCheckIssue['fix']): PlanCheckIssue => ({
  id: id(1),
  trip_id: id(2),
  version_id: id(3),
  kind: 'too_far',
  params: { drive_minutes: 240, limit_minutes: 180, longest_leg_minutes: 120, after_dark: true },
  severity: 'fix',
  day_id: id(4),
  stable_ids: [],
  fix,
  rank: 0,
  fingerprint: 'too_far:1',
});

describe('where an issue opens', () => {
  it('sends a too-far day to the plan check, where its nearer swap is', () => {
    expect(fixerId(tooFar({ kind: 'screen', screen: 'too_far' }))).toBe('7h-1');
    expect(fixerId(tooFar({ kind: 'none' }))).toBe('7h-1');
  });

  it('sends a day a better order fixes to less driving, and rain to rain and crowds', () => {
    expect(fixerId(tooFar({ kind: 'screen', screen: 'less_driving' }))).toBe('7h-3');
    expect(fixerId(tooFar({ kind: 'screen', screen: 'rain_crowds' }))).toBe('7h-4');
  });
});
