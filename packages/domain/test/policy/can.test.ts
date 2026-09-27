/**
 * Table-driven actor × action coverage for the `can()` dispatcher (docs/system-architecture.md §5
 * permission-contract-suite fixtures: outsider, ex-member, member, organiser, guest/anonymous).
 * Per-branch coverage of each rule's own logic lives in ./crew.test.ts, ./trip.test.ts and
 * ./plan.test.ts; this file instead proves the dispatcher wires every action to the right rule and
 * that the outcome pattern (member/organiser allowed, outsider/ex-member/guest denied) holds
 * consistently across the actions gated purely by "is the actor an active member/participant".
 */
import { describe, expect, it } from 'vitest';

import type { CrewMembershipFact } from '../../src/policy/crew';
import { can } from '../../src/policy/index';
import type { TripParticipantFact } from '../../src/policy/trip';
import type { PolicyActor, PolicyResult } from '../../src/policy/types';

const ACTOR_KINDS = ['outsider', 'ex_member', 'member', 'organiser', 'guest'] as const;
type ActorKind = (typeof ACTOR_KINDS)[number];

const UID = 'actor-1';

function actorFor(kind: ActorKind): PolicyActor {
  return { uid: UID, isAnonymous: kind === 'guest', roles: [], via: 'app' };
}

function crewMembershipFor(kind: ActorKind): CrewMembershipFact | null {
  switch (kind) {
    case 'outsider':
    case 'guest':
      return null;
    case 'ex_member':
      return { role: 'member', status: 'removed', joinedEpoch: 1 };
    case 'member':
      return { role: 'member', status: 'active', joinedEpoch: 1 };
    case 'organiser':
      return { role: 'organiser', status: 'active', joinedEpoch: 1 };
  }
}

function tripParticipantFor(kind: ActorKind): TripParticipantFact | null {
  switch (kind) {
    case 'outsider':
    case 'ex_member':
    case 'guest':
      return null;
    case 'member':
      return { role: 'member' };
    case 'organiser':
      return { role: 'organiser' };
  }
}

/** member and organiser pass every "active member/participant" gate; the rest are denied NOT_FOUND. */
const ALLOWED_KINDS: ReadonlySet<ActorKind> = new Set(['member', 'organiser']);
const ALLOW: PolicyResult = { ok: true };
const NOT_FOUND: PolicyResult = { ok: false, deny: 'NOT_FOUND' };

describe.each(ACTOR_KINDS)('can() actor matrix: %s', (kind) => {
  const expectMembershipGate = ALLOWED_KINDS.has(kind) ? ALLOW : NOT_FOUND;

  it('rename_crew', () => {
    expect(can(actorFor(kind), 'rename_crew', { actorMembership: crewMembershipFor(kind) })).toEqual(
      expectMembershipGate,
    );
  });

  it('create_trip', () => {
    expect(can(actorFor(kind), 'create_trip', { actorIsCrewMember: ALLOWED_KINDS.has(kind) })).toEqual(
      expectMembershipGate,
    );
  });

  it('view_plan_version (crew-visible)', () => {
    expect(
      can(actorFor(kind), 'view_plan_version', {
        actorIsTripMember: ALLOWED_KINDS.has(kind),
        actorIsTripOrganiser: kind === 'organiser',
        visibility: 'crew',
      }),
    ).toEqual(expectMembershipGate);
  });

  it('propose_change_set', () => {
    expect(
      can(actorFor(kind), 'propose_change_set', { actorIsTripMember: ALLOWED_KINDS.has(kind) }),
    ).toEqual(expectMembershipGate);
  });

  it('transition_trip (organiser-only, legal pair)', () => {
    const result = can(actorFor(kind), 'transition_trip', {
      actorParticipant: tripParticipantFor(kind),
      from: 'voting',
      to: 'won',
    });
    if (kind === 'organiser') {
      expect(result).toEqual(ALLOW);
    } else if (kind === 'member') {
      expect(result).toEqual({ ok: false, deny: 'FORBIDDEN' });
    } else {
      expect(result).toEqual(NOT_FOUND);
    }
  });
});

describe('can() dispatcher: self/other-targeted actions', () => {
  it('leave_crew: self always allowed, another user always forbidden', () => {
    const membership: CrewMembershipFact = { role: 'member', status: 'active', joinedEpoch: 1 };
    expect(
      can(actorFor('member'), 'leave_crew', { actorMembership: membership, targetUserId: UID }),
    ).toEqual({ ok: true });
    expect(
      can(actorFor('member'), 'leave_crew', { actorMembership: membership, targetUserId: 'someone-else' }),
    ).toEqual({ ok: false, deny: 'FORBIDDEN' });
  });

  it('remove_crew_member: organiser may remove another active member', () => {
    const organiser: CrewMembershipFact = { role: 'organiser', status: 'active', joinedEpoch: 1 };
    const target: CrewMembershipFact = { role: 'member', status: 'active', joinedEpoch: 2 };
    expect(
      can(actorFor('organiser'), 'remove_crew_member', {
        actorMembership: organiser,
        targetUserId: 'someone-else',
        targetMembership: target,
      }),
    ).toEqual({ ok: true });
  });

  it('set_rsvp: only the participant themselves may set their own RSVP', () => {
    expect(
      can(actorFor('member'), 'set_rsvp', {
        actorParticipant: { role: 'member' },
        targetUserId: UID,
      }),
    ).toEqual({ ok: true });
    expect(
      can(actorFor('organiser'), 'set_rsvp', {
        actorParticipant: { role: 'organiser' },
        targetUserId: 'someone-else',
      }),
    ).toEqual({ ok: false, deny: 'FORBIDDEN' });
  });
});
