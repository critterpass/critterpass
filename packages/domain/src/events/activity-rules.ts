/**
 * Domain event → activity ticker projection (docs/data-model.md §3.3 `activity_events`).
 * A type with no entry here never projects (private events stay out of the crew-visible ticker) —
 * `appendDomainEvent` (packages/db/src/events.ts) only calls `app.append_activity` when this
 * returns non-null. `textKey` is an i18n id (`activity.<verb>`); rendering copy is a later phase.
 */
import type { DomainEventType } from './catalogue';

export interface ActivityProjection {
  readonly verb: string;
  readonly objectKind: string;
  readonly textKey: string;
}

const ACTIVITY_RULES: Partial<Record<DomainEventType, ActivityProjection>> = {
  'crew.member_joined': { verb: 'joined', objectKind: 'crew_member', textKey: 'activity.joined' },
  'crew.member_left': { verb: 'left', objectKind: 'crew_member', textKey: 'activity.left' },
  'crew.member_removed': {
    verb: 'removed',
    objectKind: 'crew_member',
    textKey: 'activity.removed',
  },
  'trip.created': { verb: 'created', objectKind: 'trip', textKey: 'activity.trip_created' },
  'trip.status_changed': {
    verb: 'moved',
    objectKind: 'trip',
    textKey: 'activity.trip_status_changed',
  },
  'plan.version_created': {
    verb: 'drafted',
    objectKind: 'itinerary_version',
    textKey: 'activity.plan_version_created',
  },
  'change_set.proposed': {
    verb: 'proposed',
    objectKind: 'change_set',
    textKey: 'activity.change_set_proposed',
  },
  'change_set.applied': {
    verb: 'applied',
    objectKind: 'change_set',
    textKey: 'activity.change_set_applied',
  },
  'change_set.reverted': {
    verb: 'reverted',
    objectKind: 'change_set',
    textKey: 'activity.change_set_reverted',
  },
  'change_set.rejected': {
    verb: 'rejected',
    objectKind: 'change_set',
    textKey: 'activity.change_set_rejected',
  },
  'guide_action.undone': {
    verb: 'undid',
    objectKind: 'guide_action',
    textKey: 'activity.guide_action_undone',
  },
  'rsvp.changed': {
    verb: 'rsvped',
    objectKind: 'trip_participant',
    textKey: 'activity.rsvp_changed',
  },
  'seat_offer.accepted': {
    verb: 'took_seat',
    objectKind: 'trip_participant',
    textKey: 'activity.seat_taken',
  },
  'poll.created': { verb: 'asked', objectKind: 'poll', textKey: 'activity.poll_created' },
  'poll.candidate_added': {
    verb: 'pitched',
    objectKind: 'poll_option',
    textKey: 'activity.poll_candidate_added',
  },
  'poll.closed': { verb: 'decided', objectKind: 'poll', textKey: 'activity.poll_closed' },
};

/** The activity-ticker projection for `type`, or `null` if it is a private event that never projects. */
export function projectActivity(type: DomainEventType): ActivityProjection | null {
  return ACTIVITY_RULES[type] ?? null;
}
