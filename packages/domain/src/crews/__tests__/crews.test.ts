import { describe, expect, it } from 'vitest';

import { GUIDE_COLOURS } from '../../enums/catalogue';
import {
  encodeMemberColour,
  memberColourForSlot,
  nextMemberColour,
  parseMemberColour,
} from '../colours';
import {
  canStartCrew,
  CREW_MEMBER_CEILING,
  crewNameSchema,
  decideCrewJoin,
  MAX_ACTIVE_CREWS_PER_USER,
} from '../limits';
import { updateCrewPayloadSchema } from '../wire';

describe('member colours', () => {
  it('hands out the six accents in join order, then dashed, then double rings', () => {
    expect(GUIDE_COLOURS.map((_, slot) => encodeMemberColour(memberColourForSlot(slot)))).toEqual([
      ...GUIDE_COLOURS,
    ]);
    expect(encodeMemberColour(memberColourForSlot(6))).toBe('yellow/dashed');
    expect(encodeMemberColour(memberColourForSlot(11))).toBe('cream/dashed');
    expect(encodeMemberColour(memberColourForSlot(12))).toBe('yellow/double');
    expect(encodeMemberColour(memberColourForSlot(15))).toBe('pink/double');
  });

  it('keeps all sixteen members distinguishable', () => {
    const all = Array.from({ length: CREW_MEMBER_CEILING }, (_, slot) =>
      encodeMemberColour(memberColourForSlot(slot)),
    );
    expect(new Set(all).size).toBe(CREW_MEMBER_CEILING);
    for (const encoded of all) expect(parseMemberColour(encoded)).not.toBeNull();
  });

  it('reuses the lowest slot a departed member left', () => {
    expect(nextMemberColour([])).toBe('yellow');
    expect(nextMemberColour(['yellow', 'orange', 'pink'])).toBe('blue');
    const six = [...GUIDE_COLOURS];
    expect(nextMemberColour(six)).toBe('yellow/dashed');
  });

  it('rejects colours it did not mint', () => {
    expect(parseMemberColour('purple')).toBeNull();
    expect(parseMemberColour('blue/zigzag')).toBeNull();
    expect(parseMemberColour(null)).toBeNull();
  });
});

describe('crew limits', () => {
  const base = {
    alreadyMember: false,
    activeMembers: 4,
    memberCeiling: CREW_MEMBER_CEILING,
    joinerActiveCrews: 2,
    maxActiveCrews: MAX_ACTIVE_CREWS_PER_USER,
  };

  it('lets someone join a crew below its ceiling', () => {
    expect(decideCrewJoin(base)).toEqual({ kind: 'join' });
  });

  it('blocks the 17th member with the crew-full outcome, never a seat limit', () => {
    expect(decideCrewJoin({ ...base, activeMembers: 16 })).toEqual({
      kind: 'crew_full',
      ceiling: 16,
    });
  });

  it('blocks an 11th active crew for the joiner', () => {
    expect(decideCrewJoin({ ...base, joinerActiveCrews: 10 })).toEqual({
      kind: 'crew_limit',
      limit: 10,
    });
    expect(canStartCrew(9, MAX_ACTIVE_CREWS_PER_USER)).toBe(true);
    expect(canStartCrew(10, MAX_ACTIVE_CREWS_PER_USER)).toBe(false);
  });

  it('recognises an existing member before any limit', () => {
    expect(decideCrewJoin({ ...base, alreadyMember: true, activeMembers: 16 })).toEqual({
      kind: 'already_member',
    });
  });

  it('normalises crew names and caps them at 32 characters', () => {
    expect(crewNameSchema.parse('  Bali   crew ')).toBe('Bali crew');
    expect(crewNameSchema.safeParse('   ').success).toBe(false);
    expect(crewNameSchema.safeParse('x'.repeat(33)).success).toBe(false);
    expect(crewNameSchema.safeParse('x'.repeat(32)).success).toBe(true);
  });

  it('needs something to change on update', () => {
    expect(updateCrewPayloadSchema.safeParse({ crew_id: crypto.randomUUID() }).success).toBe(false);
  });
});
