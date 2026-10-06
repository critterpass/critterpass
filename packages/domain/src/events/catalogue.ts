/**
 * Domain event type registry (docs/api-contracts.md §2.4, docs/system-architecture.md §4.1): one
 * zod payload schema per type, named `aggregate.past_tense`. `app.append_event` inserts into
 * `domain_events` only after `parseDomainEvent` (./envelope.ts) validates the payload against the
 * type it is filed under, so a typo'd or malformed payload never reaches the append-only log.
 * Every payload here carries only ids and enum values — never a C3 field — because `domain_events`
 * is exported to analytics and consumers see it crew/trip-wide; later phases append more types,
 * never remove or repurpose one (the log is append-only, so old rows must stay parseable).
 */
import { z } from 'zod';

import { tripParticipantRsvpSchema, tripStatusSchema } from '../enums/trip';
import { moderationVerdictSchema } from '../admin/ops-enums';
import { grantablePerkSchema } from '../admin/support';
import { itineraryVersionVisibilitySchema } from '../enums/plan';
import { TRAVEL_DATA_EVENT_PAYLOADS } from '../travel-data/events';
import { CHAT_EVENT_PAYLOADS, CHAT_EVENT_TYPES } from '../chat/events';
import { GROWTH_EVENT_PAYLOADS, GROWTH_EVENT_TYPES } from '../crews/events';
import { HOME_EVENT_PAYLOADS, HOME_EVENT_TYPES } from '../home/events';
import { LIVE_MAP_EVENT_PAYLOADS, LIVE_MAP_EVENT_TYPES } from '../live-map/events';
import { POLL_EVENT_PAYLOADS, POLL_EVENT_TYPES } from '../polls/events';
import { SETUP_EVENT_PAYLOADS, SETUP_EVENT_TYPES } from '../setup/events';
import { DRAFT_EVENT_PAYLOADS, DRAFT_EVENT_TYPES } from '../itinerary/events';
import { MONEY_EVENT_PAYLOADS, MONEY_EVENT_TYPES } from '../money/events';
import { BOOKING_EVENT_PAYLOADS, BOOKING_EVENT_TYPES } from '../bookings/events';
import { BILLING_EVENT_PAYLOADS, BILLING_EVENT_TYPES } from '../billing/events';
import { HELP_EVENT_PAYLOADS, HELP_EVENT_TYPES } from '../help/events';
import { PLAN_EVENT_PAYLOADS, PLAN_EVENT_TYPES } from '../plan/events';
import { GUIDE_EVENT_PAYLOADS, GUIDE_EVENT_TYPES } from '../guide/events';
import { SUPPLIER_EVENT_PAYLOADS, SUPPLIER_EVENT_TYPES } from '../suppliers/events';
import { TRIP_DAY_EVENT_PAYLOADS, TRIP_DAY_EVENT_TYPES } from '../trip-day/events';
import { DISRUPTION_EVENT_PAYLOADS, DISRUPTION_EVENT_TYPES } from '../disruptions/events';
import { EXPLORE_EVENT_PAYLOADS, EXPLORE_EVENT_TYPES } from '../explore/events';
import { PLANNING_EVENT_PAYLOADS, PLANNING_EVENT_TYPES } from '../planning/events';
import { COMMUNITY_EVENT_PAYLOADS, COMMUNITY_EVENT_TYPES } from '../community/events';
import { PROPOSAL_EVENT_PAYLOADS, PROPOSAL_EVENT_TYPES } from '../proposal/events';
import { CRITTER_EVENT_PAYLOADS, CRITTER_EVENT_TYPES } from '../critters/events';
import { QUEST_EVENT_PAYLOADS, QUEST_EVENT_TYPES } from '../quests/events';
import { LA_EVENT_PAYLOADS, LA_EVENT_TYPES } from '../surfaces/la-events';
import { YOU_EVENT_PAYLOADS, YOU_EVENT_TYPES } from '../you/events';
import { ACCOUNT_EVENT_PAYLOADS, ACCOUNT_EVENT_TYPES } from '../account/events';
import { PROFILE_FIELDS } from '../you/profile';
import { SAFETY_EVENT_PAYLOADS, SAFETY_EVENT_TYPES } from '../safety/events';
import { RECAP_EVENT_PAYLOADS, RECAP_EVENT_TYPES } from '../recap/events';
import { ALBUM_EVENT_PAYLOADS, ALBUM_EVENT_TYPES } from '../album/events';

export const DOMAIN_EVENT_TYPES = [
  'crew.member_joined',
  'crew.member_left',
  'crew.member_removed',
  'trip.created',
  'trip.status_changed',
  'plan.version_created',
  'change_set.proposed',
  'change_set.applied',
  'change_set.reverted',
  'change_set.rejected',
  'rsvp.changed',
  'auth.merged',
  'invite.opened',
  'attribution.claimed',
  'guide_action.undone',
  'fare.dropped',
  'forecast.changed',
  'hazard.changed',
  'moderation.decided',
  'entitlement.granted',
  'entitlement.revoked',
  'device.permissions_changed',
  'visit.recorded',
  'pass.issued',
  'profile.updated',
  'profile.taste_changed',
  'profile.avatar_changed',
  ...GROWTH_EVENT_TYPES,
  ...CHAT_EVENT_TYPES,
  ...HOME_EVENT_TYPES,
  ...LIVE_MAP_EVENT_TYPES,
  ...POLL_EVENT_TYPES,
  ...SETUP_EVENT_TYPES,
  ...DRAFT_EVENT_TYPES,
  ...MONEY_EVENT_TYPES,
  ...BOOKING_EVENT_TYPES,
  ...BILLING_EVENT_TYPES,
  ...HELP_EVENT_TYPES,
  ...PLAN_EVENT_TYPES,
  ...GUIDE_EVENT_TYPES,
  ...SUPPLIER_EVENT_TYPES,
  ...TRIP_DAY_EVENT_TYPES,
  ...DISRUPTION_EVENT_TYPES,
  ...EXPLORE_EVENT_TYPES,
  ...PLANNING_EVENT_TYPES,
  ...COMMUNITY_EVENT_TYPES,
  ...PROPOSAL_EVENT_TYPES,
  ...CRITTER_EVENT_TYPES,
  ...QUEST_EVENT_TYPES,
  ...LA_EVENT_TYPES,
  ...YOU_EVENT_TYPES,
  ...SAFETY_EVENT_TYPES,
  ...ACCOUNT_EVENT_TYPES,
  ...RECAP_EVENT_TYPES,
  ...ALBUM_EVENT_TYPES,
] as const;
export const domainEventTypeSchema = z.enum(DOMAIN_EVENT_TYPES);
export type DomainEventType = z.infer<typeof domainEventTypeSchema>;

const crewMembershipPayloadSchema = z.object({ crew_id: z.uuid(), user_id: z.uuid() });
const changeSetPayloadSchema = z.object({ trip_id: z.uuid(), change_set_id: z.uuid() });

const DOMAIN_EVENT_CATALOGUE = {
  'crew.member_joined': crewMembershipPayloadSchema,
  'crew.member_left': crewMembershipPayloadSchema,
  'crew.member_removed': crewMembershipPayloadSchema,
  'trip.created': z.object({ trip_id: z.uuid(), crew_id: z.uuid() }),
  'trip.status_changed': z.object({
    trip_id: z.uuid(),
    from: tripStatusSchema.nullable(),
    to: tripStatusSchema,
  }),
  'plan.version_created': z.object({
    trip_id: z.uuid(),
    version_id: z.uuid(),
    visibility: itineraryVersionVisibilitySchema,
  }),
  'change_set.proposed': changeSetPayloadSchema,
  'change_set.applied': changeSetPayloadSchema.extend({ result_version_id: z.uuid() }),
  'change_set.reverted': changeSetPayloadSchema,
  'change_set.rejected': changeSetPayloadSchema,
  'rsvp.changed': z.object({
    trip_id: z.uuid(),
    user_id: z.uuid(),
    rsvp: tripParticipantRsvpSchema,
  }),
  'auth.merged': z.object({ from_uid: z.uuid(), into_uid: z.uuid() }),
  // First human (non-bot) open of an invite link; aggregate is the join code.
  'invite.opened': z.object({ join_code_id: z.uuid(), channel: z.string().nullable() }),
  // Aggregate is the installing device; `link_kind` is null when a phone match found nothing.
  'attribution.claimed': z.object({
    device_id: z.uuid(),
    via: z.enum(['referrer', 'paste', 'code', 'phone', 'clip', 'link']),
    link_kind: z.string().nullable(),
  }),
  'guide_action.undone': z.object({
    trip_id: z.uuid(),
    action_id: z.uuid(),
    undo_action_id: z.uuid(),
    change_set_id: z.uuid(),
  }),
  ...TRAVEL_DATA_EVENT_PAYLOADS,
  // Aggregate is the moderation report; the subject kind's owning phase consumes it.
  'moderation.decided': z.object({
    report_id: z.uuid(),
    target_kind: z.string(),
    target_id: z.uuid(),
    verdict: moderationVerdictSchema,
  }),
  // Aggregate is the support grant (`ops.entitlement_grants`); the user's entitlements recompute.
  'entitlement.granted': z.object({
    user_id: z.uuid(),
    grant_id: z.uuid(),
    perk: grantablePerkSchema,
    until: z.iso.datetime({ offset: true }),
  }),
  'entitlement.revoked': z.object({
    user_id: z.uuid(),
    grant_id: z.uuid(),
    perk: grantablePerkSchema,
  }),
  // Aggregate is the device; only the derived capability leaves the device row, never the raw list.
  'device.permissions_changed': z.object({
    device_id: z.uuid(),
    push: z.enum(['alert', 'quiet', 'inbox']),
    can_ring: z.boolean(),
    live_activities: z.boolean(),
    encounters: z.enum(['background', 'session', 'off']),
  }),
  // Aggregate is the visit; no POI and no times here (visits are C3, owner-only).
  'visit.recorded': z.object({
    visit_id: z.uuid(),
    trip_id: z.uuid(),
    source: z.enum(['geofence', 'expense', 'manual']),
  }),
  // Aggregate is the pass; the rows themselves reach the crew through sync.
  'pass.issued': z.object({ pass_id: z.uuid(), user_id: z.uuid() }),
  // Aggregate is the user; names the fields that changed, never their values.
  'profile.updated': z.object({
    user_id: z.uuid(),
    fields: z.array(z.enum(PROFILE_FIELDS)).min(1),
  }),
  'profile.taste_changed': z.object({ user_id: z.uuid(), source: z.enum(['quiz', 'chips']) }),
  'profile.avatar_changed': z.object({
    user_id: z.uuid(),
    avatar_id: z.uuid(),
    kind: z.enum(['initials', 'critter', 'photo']),
  }),
  ...GROWTH_EVENT_PAYLOADS,
  ...CHAT_EVENT_PAYLOADS,
  ...HOME_EVENT_PAYLOADS,
  ...LIVE_MAP_EVENT_PAYLOADS,
  ...POLL_EVENT_PAYLOADS,
  ...SETUP_EVENT_PAYLOADS,
  ...DRAFT_EVENT_PAYLOADS,
  ...MONEY_EVENT_PAYLOADS,
  ...BOOKING_EVENT_PAYLOADS,
  ...BILLING_EVENT_PAYLOADS,
  ...HELP_EVENT_PAYLOADS,
  ...PLAN_EVENT_PAYLOADS,
  ...GUIDE_EVENT_PAYLOADS,
  ...SUPPLIER_EVENT_PAYLOADS,
  ...TRIP_DAY_EVENT_PAYLOADS,
  ...DISRUPTION_EVENT_PAYLOADS,
  ...EXPLORE_EVENT_PAYLOADS,
  ...PLANNING_EVENT_PAYLOADS,
  ...COMMUNITY_EVENT_PAYLOADS,
  ...PROPOSAL_EVENT_PAYLOADS,
  ...CRITTER_EVENT_PAYLOADS,
  ...QUEST_EVENT_PAYLOADS,
  ...LA_EVENT_PAYLOADS,
  ...YOU_EVENT_PAYLOADS,
  ...SAFETY_EVENT_PAYLOADS,
  ...ACCOUNT_EVENT_PAYLOADS,
  ...RECAP_EVENT_PAYLOADS,
  ...ALBUM_EVENT_PAYLOADS,
} as const satisfies Record<DomainEventType, z.ZodType>;

export function getDomainEventPayloadSchema(type: DomainEventType): z.ZodType {
  return DOMAIN_EVENT_CATALOGUE[type];
}
