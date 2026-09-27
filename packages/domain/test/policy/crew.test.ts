import { describe, expect, it } from 'vitest';

import {
  canLeaveCrew,
  canRemoveCrewMember,
  canRenameCrew,
  checkCrewEpoch,
  type CrewMembershipFact,
} from '../../src/policy/crew';
import type { PolicyActor } from '../../src/policy/types';

const ORGANISER_ID = 'organiser-1';
const MEMBER_ID = 'member-1';
const OUTSIDER_ID = 'outsider-1';

function actor(uid: string): PolicyActor {
  return { uid, isAnonymous: false, roles: [], via: 'app' };
}

function membership(overrides: Partial<CrewMembershipFact> = {}): CrewMembershipFact {
  return { role: 'member', status: 'active', joinedEpoch: 1, ...overrides };
}

describe('canRenameCrew', () => {
  it('allows an active member', () => {
    expect(canRenameCrew(actor(MEMBER_ID), { actorMembership: membership() })).toEqual({
      ok: true,
    });
  });

  it('allows an active organiser', () => {
    expect(
      canRenameCrew(actor(ORGANISER_ID), { actorMembership: membership({ role: 'organiser' }) }),
    ).toEqual({ ok: true });
  });

  it('denies an outsider with NOT_FOUND (never leaks that the crew exists)', () => {
    expect(canRenameCrew(actor(OUTSIDER_ID), { actorMembership: null })).toEqual({
      ok: false,
      deny: 'NOT_FOUND',
    });
  });

  it('denies an ex-member (removed) with NOT_FOUND', () => {
    expect(
      canRenameCrew(actor(MEMBER_ID), { actorMembership: membership({ status: 'removed' }) }),
    ).toEqual({ ok: false, deny: 'NOT_FOUND' });
  });
});

describe('canLeaveCrew', () => {
  it('denies a non-member with NOT_FOUND', () => {
    expect(
      canLeaveCrew(actor(OUTSIDER_ID), { actorMembership: null, targetUserId: MEMBER_ID }),
    ).toEqual({ ok: false, deny: 'NOT_FOUND' });
  });

  it("denies a member leaving on someone else's behalf with FORBIDDEN", () => {
    expect(
      canLeaveCrew(actor(MEMBER_ID), { actorMembership: membership(), targetUserId: ORGANISER_ID }),
    ).toEqual({ ok: false, deny: 'FORBIDDEN' });
  });

  it('allows a member to leave for themselves', () => {
    expect(
      canLeaveCrew(actor(MEMBER_ID), { actorMembership: membership(), targetUserId: MEMBER_ID }),
    ).toEqual({ ok: true });
  });
});

describe('canRemoveCrewMember', () => {
  it('denies a non-member acting with NOT_FOUND', () => {
    expect(
      canRemoveCrewMember(actor(OUTSIDER_ID), {
        actorMembership: null,
        targetUserId: MEMBER_ID,
        targetMembership: membership(),
      }),
    ).toEqual({ ok: false, deny: 'NOT_FOUND' });
  });

  it('denies self-removal through this rule (must use canLeaveCrew instead)', () => {
    expect(
      canRemoveCrewMember(actor(MEMBER_ID), {
        actorMembership: membership(),
        targetUserId: MEMBER_ID,
        targetMembership: membership(),
      }),
    ).toEqual({ ok: false, deny: 'FORBIDDEN' });
  });

  it('denies a plain member removing someone else', () => {
    expect(
      canRemoveCrewMember(actor(MEMBER_ID), {
        actorMembership: membership(),
        targetUserId: OUTSIDER_ID,
        targetMembership: membership({ role: 'member' }),
      }),
    ).toEqual({ ok: false, deny: 'FORBIDDEN' });
  });

  it('denies an organiser removing an already-inactive target with NOT_FOUND', () => {
    expect(
      canRemoveCrewMember(actor(ORGANISER_ID), {
        actorMembership: membership({ role: 'organiser' }),
        targetUserId: MEMBER_ID,
        targetMembership: membership({ status: 'left' }),
      }),
    ).toEqual({ ok: false, deny: 'NOT_FOUND' });
  });

  it('allows an organiser to remove an active member', () => {
    expect(
      canRemoveCrewMember(actor(ORGANISER_ID), {
        actorMembership: membership({ role: 'organiser' }),
        targetUserId: MEMBER_ID,
        targetMembership: membership(),
      }),
    ).toEqual({ ok: true });
  });
});

describe('checkCrewEpoch', () => {
  it('allows an actor who has never joined (joinedEpoch null)', () => {
    expect(checkCrewEpoch(0, null)).toEqual({ ok: true });
  });

  it('allows a base epoch at or after the join epoch', () => {
    expect(checkCrewEpoch(3, 3)).toEqual({ ok: true });
    expect(checkCrewEpoch(4, 3)).toEqual({ ok: true });
  });

  it('denies a base epoch older than the join epoch', () => {
    expect(checkCrewEpoch(2, 3)).toEqual({ ok: false, deny: 'FORBIDDEN' });
  });
});
