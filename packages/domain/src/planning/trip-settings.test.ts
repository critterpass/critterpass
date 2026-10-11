import { describe, expect, it } from 'vitest';

import { datesImpactOf, planChangeRuleOf, planEditRights } from './trip-settings';

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

describe('datesImpactOf', () => {
  const now = new Date('2027-03-01T00:00:00Z');
  const range = { start: '2027-04-16', end: '2027-04-23' };
  const terms = (startsOn: string | null, freeCancelUntil: string | null) => ({
    startsOn,
    freeCancelUntil,
  });

  it('keeps a booking inside the new dates, or with no date, as it is', () => {
    expect(datesImpactOf(terms('2027-04-16', null), range, now)).toBe('fine');
    expect(datesImpactOf(terms('2027-04-23', null), range, now)).toBe('fine');
    expect(datesImpactOf(terms(null, null), range, now)).toBe('fine');
  });

  it('moves, loses or asks about a booking the new dates leave out', () => {
    expect(datesImpactOf(terms('2027-04-03', '2027-03-20T00:00:00Z'), range, now)).toBe('moves');
    expect(datesImpactOf(terms('2027-04-03', '2027-02-20T00:00:00Z'), range, now)).toBe('lost');
    expect(datesImpactOf(terms('2027-04-03', null), range, now)).toBe('ask');
  });
});
