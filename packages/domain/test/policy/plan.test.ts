import { describe, expect, it } from 'vitest';

import { canProposeChangeSet, canViewPlanVersion } from '../../src/policy/plan';
import type { PolicyActor } from '../../src/policy/types';

const MEMBER_ID = 'member-1';
const OUTSIDER_ID = 'outsider-1';

function actor(uid: string): PolicyActor {
  return { uid, isAnonymous: false, roles: [], via: 'app' };
}

describe('canViewPlanVersion', () => {
  it('denies a non-trip-member with NOT_FOUND', () => {
    expect(
      canViewPlanVersion(actor(OUTSIDER_ID), {
        actorIsTripMember: false,
        actorIsTripOrganiser: false,
        visibility: 'crew',
      }),
    ).toEqual({ ok: false, deny: 'NOT_FOUND' });
  });

  it('allows any trip member to see a crew-visible version', () => {
    expect(
      canViewPlanVersion(actor(MEMBER_ID), {
        actorIsTripMember: true,
        actorIsTripOrganiser: false,
        visibility: 'crew',
      }),
    ).toEqual({ ok: true });
  });

  it('allows the organiser to see an organiser-only draft', () => {
    expect(
      canViewPlanVersion(actor(MEMBER_ID), {
        actorIsTripMember: true,
        actorIsTripOrganiser: true,
        visibility: 'organiser',
      }),
    ).toEqual({ ok: true });
  });

  it('hides an organiser-only draft from a plain member with NOT_FOUND (mirrors zero RLS rows, not FORBIDDEN)', () => {
    expect(
      canViewPlanVersion(actor(MEMBER_ID), {
        actorIsTripMember: true,
        actorIsTripOrganiser: false,
        visibility: 'organiser',
      }),
    ).toEqual({ ok: false, deny: 'NOT_FOUND' });
  });
});

describe('canProposeChangeSet', () => {
  it('allows any trip member', () => {
    expect(canProposeChangeSet(actor(MEMBER_ID), { actorIsTripMember: true })).toEqual({
      ok: true,
    });
  });

  it('denies a non-trip-member with NOT_FOUND', () => {
    expect(canProposeChangeSet(actor(OUTSIDER_ID), { actorIsTripMember: false })).toEqual({
      ok: false,
      deny: 'NOT_FOUND',
    });
  });
});
