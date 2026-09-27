import { describe, expect, it } from 'vitest';

import { canCreateTrip, canSetRsvp, canTransitionTripStatus } from '../../src/policy/trip';
import type { PolicyActor } from '../../src/policy/types';

const ORGANISER_ID = 'organiser-1';
const MEMBER_ID = 'member-1';
const OUTSIDER_ID = 'outsider-1';

function actor(uid: string): PolicyActor {
  return { uid, isAnonymous: false, roles: [], via: 'app' };
}

describe('canCreateTrip', () => {
  it('allows an active crew member', () => {
    expect(canCreateTrip(actor(MEMBER_ID), { actorIsCrewMember: true })).toEqual({ ok: true });
  });

  it('denies a non-member with NOT_FOUND', () => {
    expect(canCreateTrip(actor(OUTSIDER_ID), { actorIsCrewMember: false })).toEqual({
      ok: false,
      deny: 'NOT_FOUND',
    });
  });
});

describe('canTransitionTripStatus', () => {
  it('denies a non-participant with NOT_FOUND', () => {
    expect(
      canTransitionTripStatus(actor(OUTSIDER_ID), {
        actorParticipant: null,
        from: 'voting',
        to: 'won',
      }),
    ).toEqual({ ok: false, deny: 'NOT_FOUND' });
  });

  it('denies a plain member with FORBIDDEN (they already know the trip exists)', () => {
    expect(
      canTransitionTripStatus(actor(MEMBER_ID), {
        actorParticipant: { role: 'member' },
        from: 'voting',
        to: 'won',
      }),
    ).toEqual({ ok: false, deny: 'FORBIDDEN' });
  });

  it('denies an organiser requesting an illegal transition with STATE_INVALID', () => {
    expect(
      canTransitionTripStatus(actor(ORGANISER_ID), {
        actorParticipant: { role: 'organiser' },
        from: 'voting',
        to: 'confirmed',
      }),
    ).toEqual({ ok: false, deny: 'STATE_INVALID' });
  });

  it('allows an organiser requesting a legal transition', () => {
    expect(
      canTransitionTripStatus(actor(ORGANISER_ID), {
        actorParticipant: { role: 'organiser' },
        from: 'voting',
        to: 'won',
      }),
    ).toEqual({ ok: true });
  });

  it('allows an organiser starting a brand new trip (from null)', () => {
    expect(
      canTransitionTripStatus(actor(ORGANISER_ID), {
        actorParticipant: { role: 'organiser' },
        from: null,
        to: 'voting',
      }),
    ).toEqual({ ok: true });
  });
});

describe('canSetRsvp', () => {
  it('denies a non-participant with NOT_FOUND', () => {
    expect(canSetRsvp(actor(OUTSIDER_ID), { actorParticipant: null, targetUserId: MEMBER_ID })).toEqual({
      ok: false,
      deny: 'NOT_FOUND',
    });
  });

  it('allows a participant to set their own RSVP', () => {
    expect(
      canSetRsvp(actor(MEMBER_ID), { actorParticipant: { role: 'member' }, targetUserId: MEMBER_ID }),
    ).toEqual({ ok: true });
  });

  it('denies a participant setting another member\'s RSVP', () => {
    expect(
      canSetRsvp(actor(MEMBER_ID), { actorParticipant: { role: 'member' }, targetUserId: ORGANISER_ID }),
    ).toEqual({ ok: false, deny: 'FORBIDDEN' });
  });

  it('denies even an organiser setting someone else\'s RSVP (self-service only)', () => {
    expect(
      canSetRsvp(actor(ORGANISER_ID), {
        actorParticipant: { role: 'organiser' },
        targetUserId: MEMBER_ID,
      }),
    ).toEqual({ ok: false, deny: 'FORBIDDEN' });
  });
});
