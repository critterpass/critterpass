/**
 * Crew policy rules (docs/data-model.md §2, §3.2): mirrors the RLS backstop in
 * packages/db/migrations/*_identity_and_crews.sql so the app-layer decision and the database's own
 * default-deny agree on the same fixtures. Facts are loaded by the caller; nothing here touches a
 * database.
 */
import type { CrewMemberRole, CrewMemberStatus } from '../enums/crew';
import { ALLOW, deny, type PolicyActor, type PolicyResult } from './types';

export interface CrewMembershipFact {
  readonly role: CrewMemberRole;
  readonly status: CrewMemberStatus;
  /** Stamped by `app.crew_members_epoch`; `null` for an actor who has never joined this crew. */
  readonly joinedEpoch: number | null;
}

function isActiveMember(fact: CrewMembershipFact | null): fact is CrewMembershipFact {
  return fact !== null && fact.status === 'active';
}

export interface CrewRenameFacts {
  readonly actorMembership: CrewMembershipFact | null;
}

/**
 * Any active member may rename their crew (RLS: `crews_update` USING `app.is_crew_member(id)` plus
 * the `name`-only column grant) — deliberately looser than "organiser only", matching what the
 * schema already enforces (docs/data-model.md §3.2).
 */
export function canRenameCrew(_actor: PolicyActor, facts: CrewRenameFacts): PolicyResult {
  return isActiveMember(facts.actorMembership) ? ALLOW : deny('NOT_FOUND');
}

export interface CrewLeaveFacts {
  readonly actorMembership: CrewMembershipFact | null;
  readonly targetUserId: string;
}

/** Leaving is always self-service (RLS: `crew_members_update` USING `user_id = app.uid()`). */
export function canLeaveCrew(actor: PolicyActor, facts: CrewLeaveFacts): PolicyResult {
  if (!isActiveMember(facts.actorMembership)) return deny('NOT_FOUND');
  return facts.targetUserId === actor.uid ? ALLOW : deny('FORBIDDEN');
}

export interface CrewRemoveMemberFacts {
  readonly actorMembership: CrewMembershipFact | null;
  readonly targetUserId: string;
  readonly targetMembership: CrewMembershipFact | null;
}

/**
 * Only an organiser may remove someone else (RLS: `crew_members_update` USING
 * `app.is_crew_organiser(crew_id)`); removing yourself is always `canLeaveCrew`, never this rule.
 */
export function canRemoveCrewMember(
  actor: PolicyActor,
  facts: CrewRemoveMemberFacts,
): PolicyResult {
  if (!isActiveMember(facts.actorMembership)) return deny('NOT_FOUND');
  if (facts.targetUserId === actor.uid) return deny('FORBIDDEN');
  if (facts.actorMembership.role !== 'organiser') return deny('FORBIDDEN');
  return isActiveMember(facts.targetMembership) ? ALLOW : deny('NOT_FOUND');
}

/**
 * `base_epoch < joined_epoch` means the actor joined this crew after the client captured
 * `base_epoch` (docs/data-model.md §3.2 membership epoch): their view of the crew predates their
 * own membership, so the command they are replaying is stale. Shared by every crew-scoped command
 * that carries a `base_epoch`, not tied to one action, so it is not part of the `can()` dispatcher.
 */
export function checkCrewEpoch(baseEpoch: number, joinedEpoch: number | null): PolicyResult {
  if (joinedEpoch !== null && baseEpoch < joinedEpoch) return deny('FORBIDDEN');
  return ALLOW;
}
