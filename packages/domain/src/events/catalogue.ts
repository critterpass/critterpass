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
    fields: z.array(z.enum(['display_name', 'home_airport'])).min(1),
  }),
  'profile.taste_changed': z.object({ user_id: z.uuid(), source: z.enum(['quiz', 'chips']) }),
  'profile.avatar_changed': z.object({
    user_id: z.uuid(),
    avatar_id: z.uuid(),
    kind: z.enum(['initials', 'critter', 'photo']),
  }),
  ...GROWTH_EVENT_PAYLOADS,
  ...CHAT_EVENT_PAYLOADS,
} as const satisfies Record<DomainEventType, z.ZodType>;

export function getDomainEventPayloadSchema(type: DomainEventType): z.ZodType {
  return DOMAIN_EVENT_CATALOGUE[type];
}
