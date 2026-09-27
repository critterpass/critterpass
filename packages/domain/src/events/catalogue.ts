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
import { itineraryVersionVisibilitySchema } from '../enums/plan';
import { TRAVEL_DATA_EVENT_PAYLOADS } from '../travel-data/events';

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
} as const satisfies Record<DomainEventType, z.ZodType>;

export function getDomainEventPayloadSchema(type: DomainEventType): z.ZodType {
  return DOMAIN_EVENT_CATALOGUE[type];
}
