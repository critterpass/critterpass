/**
 * Plan policy rules (docs/data-model.md §3.3). `canViewPlanVersion` mirrors `app.is_version_visible`
 * (packages/db/migrations/*_plan_versions_and_changesets.sql) exactly: an organiser-only draft does
 * not exist from a plain member's point of view, so it is denied `NOT_FOUND`, never `FORBIDDEN`.
 */
import type { ItineraryVersionVisibility } from '../enums/plan';
import { ALLOW, deny, type PolicyActor, type PolicyResult } from './types';

export interface PlanVersionFacts {
  readonly actorIsTripMember: boolean;
  readonly actorIsTripOrganiser: boolean;
  readonly visibility: ItineraryVersionVisibility;
}

export function canViewPlanVersion(_actor: PolicyActor, facts: PlanVersionFacts): PolicyResult {
  if (!facts.actorIsTripMember) return deny('NOT_FOUND');
  if (facts.visibility === 'crew') return ALLOW;
  return facts.actorIsTripOrganiser ? ALLOW : deny('NOT_FOUND');
}

export interface ChangeSetProposeFacts {
  readonly actorIsTripMember: boolean;
}

/**
 * Any trip member may propose a change set (RLS: `change_sets_insert` USING `app.is_trip_member`).
 * Deciding a proposed change set (approve/reject/vote) is delegated to the poll policy a later
 * phase adds; this file only covers what this phase's schema itself enforces.
 */
export function canProposeChangeSet(_actor: PolicyActor, facts: ChangeSetProposeFacts): PolicyResult {
  return facts.actorIsTripMember ? ALLOW : deny('NOT_FOUND');
}
