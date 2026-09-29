/**
 * Crew live map domain events (docs/api-contracts.md §4.12). Payloads carry ids and enum values
 * only, never a position: `domain_events` is exported to analytics and read crew-wide, and
 * locations are C3. `crew.pinged` routes the ALWAYS crew ping; `meetup.*` route the budgeted
 * meet-up change, once per move and once when the whole crew is close.
 */
import { z } from 'zod';

export const LIVE_MAP_EVENT_TYPES = [
  'location_share.changed',
  'meetup.created',
  'meetup.moved',
  'meetup.crew_close',
  'crew.pinged',
] as const;
export type LiveMapEventType = (typeof LIVE_MAP_EVENT_TYPES)[number];

export const LOCATION_SHARE_CHANGES = ['on', 'off', 'paused', 'resumed'] as const;
export const PING_KINDS = ['ping', 'on_my_way'] as const;
export const pingKindSchema = z.enum(PING_KINDS);
export type PingKind = z.infer<typeof pingKindSchema>;

const meetupRef = z.object({ trip_id: z.uuid(), meetup_id: z.uuid() });

export const LIVE_MAP_EVENT_PAYLOADS = {
  'location_share.changed': z.object({
    trip_id: z.uuid(),
    share_id: z.uuid(),
    user_id: z.uuid(),
    change: z.enum(LOCATION_SHARE_CHANGES),
  }),
  'meetup.created': meetupRef.extend({ by: z.uuid() }),
  'meetup.moved': meetupRef.extend({ by: z.uuid() }),
  'meetup.crew_close': meetupRef,
  'crew.pinged': z.object({
    trip_id: z.uuid(),
    by: z.uuid(),
    kind: pingKindSchema,
    meetup_id: z.uuid().nullable(),
    /** The sender's own ETA to the meet-up for `on_my_way`, when known. */
    eta_min: z.number().int().nonnegative().nullable(),
  }),
} as const satisfies Record<LiveMapEventType, z.ZodType>;
