/**
 * `can(actor, action, resource)`: the one policy entry point command handlers and the worker call
 * (docs/system-architecture.md §5 "App policy" row). Each action name is overloaded to its own
 * resource-fact shape so a caller can never pass the wrong resource for the action it names.
 */
import {
  canLeaveCrew,
  canRemoveCrewMember,
  canRenameCrew,
  type CrewLeaveFacts,
  type CrewRemoveMemberFacts,
  type CrewRenameFacts,
} from './crew';
import {
  canProposeChangeSet,
  canViewPlanVersion,
  type ChangeSetProposeFacts,
  type PlanVersionFacts,
} from './plan';
import {
  canCreateTrip,
  canSetRsvp,
  canTransitionTripStatus,
  type TripCreateFacts,
  type TripRsvpFacts,
  type TripTransitionFacts,
} from './trip';
import type { PolicyActor, PolicyResult } from './types';

interface PolicyActionResourceMap {
  readonly rename_crew: CrewRenameFacts;
  readonly leave_crew: CrewLeaveFacts;
  readonly remove_crew_member: CrewRemoveMemberFacts;
  readonly create_trip: TripCreateFacts;
  readonly transition_trip: TripTransitionFacts;
  readonly set_rsvp: TripRsvpFacts;
  readonly view_plan_version: PlanVersionFacts;
  readonly propose_change_set: ChangeSetProposeFacts;
}

export type PolicyActionName = keyof PolicyActionResourceMap;

// One overload per action ties `resource`'s type to `action`'s literal value at every call site;
// the implementation signature below (a plain PolicyActionName + the resource-map union) is never
// visible to callers, so the internal `as` narrowing casts in its switch can never let a caller
// pass a mismatched resource shape.
export function can(actor: PolicyActor, action: 'rename_crew', resource: CrewRenameFacts): PolicyResult;
export function can(actor: PolicyActor, action: 'leave_crew', resource: CrewLeaveFacts): PolicyResult;
export function can(
  actor: PolicyActor,
  action: 'remove_crew_member',
  resource: CrewRemoveMemberFacts,
): PolicyResult;
export function can(actor: PolicyActor, action: 'create_trip', resource: TripCreateFacts): PolicyResult;
export function can(
  actor: PolicyActor,
  action: 'transition_trip',
  resource: TripTransitionFacts,
): PolicyResult;
export function can(actor: PolicyActor, action: 'set_rsvp', resource: TripRsvpFacts): PolicyResult;
export function can(
  actor: PolicyActor,
  action: 'view_plan_version',
  resource: PlanVersionFacts,
): PolicyResult;
export function can(
  actor: PolicyActor,
  action: 'propose_change_set',
  resource: ChangeSetProposeFacts,
): PolicyResult;
export function can(
  actor: PolicyActor,
  action: PolicyActionName,
  resource: PolicyActionResourceMap[PolicyActionName],
): PolicyResult {
  switch (action) {
    case 'rename_crew':
      return canRenameCrew(actor, resource as CrewRenameFacts);
    case 'leave_crew':
      return canLeaveCrew(actor, resource as CrewLeaveFacts);
    case 'remove_crew_member':
      return canRemoveCrewMember(actor, resource as CrewRemoveMemberFacts);
    case 'create_trip':
      return canCreateTrip(actor, resource as TripCreateFacts);
    case 'transition_trip':
      return canTransitionTripStatus(actor, resource as TripTransitionFacts);
    case 'set_rsvp':
      return canSetRsvp(actor, resource as TripRsvpFacts);
    case 'view_plan_version':
      return canViewPlanVersion(actor, resource as PlanVersionFacts);
    case 'propose_change_set':
      return canProposeChangeSet(actor, resource as ChangeSetProposeFacts);
  }
}

export {
  canLeaveCrew,
  canRemoveCrewMember,
  canRenameCrew,
  checkCrewEpoch,
  type CrewLeaveFacts,
  type CrewMembershipFact,
  type CrewRemoveMemberFacts,
  type CrewRenameFacts,
} from './crew';
export {
  canProposeChangeSet,
  canViewPlanVersion,
  type ChangeSetProposeFacts,
  type PlanVersionFacts,
} from './plan';
export {
  canCreateTrip,
  canSetRsvp,
  canTransitionTripStatus,
  type TripCreateFacts,
  type TripParticipantFact,
  type TripRsvpFacts,
  type TripTransitionFacts,
} from './trip';
export { ALLOW, deny, type PolicyActor, type PolicyDenialCode, type PolicyResult } from './types';
