import { describe, expect, it } from 'vitest';

import { planChangeRuleOf, planEditRights } from './trip-settings';

describe('planEditRights', () => {
  it('gives organisers both rights under every rule', () => {
    for (const rule of ['organiser_approves', 'anyone', 'organiser_only'] as const) {
      expect(planEditRights({ member: true, organiser: true, rule })).toEqual({
        direct: true,
        propose: true,
      });
    }
  });

  it('follows the rule for a member', () => {
    const member = { member: true, organiser: false };
    expect(planEditRights({ ...member, rule: 'organiser_approves' })).toEqual({
      direct: false,
      propose: true,
    });
    expect(planEditRights({ ...member, rule: 'anyone' })).toEqual({ direct: true, propose: true });
    expect(planEditRights({ ...member, rule: 'organiser_only' })).toEqual({
      direct: false,
      propose: false,
    });
  });

  it('gives someone outside the trip nothing', () => {
    expect(planEditRights({ member: false, organiser: false, rule: 'anyone' })).toEqual({
      direct: false,
      propose: false,
    });
  });

  it('reads an unknown or missing rule as the default', () => {
    expect(planChangeRuleOf(null)).toBe('organiser_approves');
    expect(planChangeRuleOf('everyone')).toBe('organiser_approves');
    expect(planChangeRuleOf('anyone')).toBe('anyone');
  });
});
