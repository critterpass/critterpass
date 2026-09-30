/**
 * Live Activity commands (docs/api-contracts.md §4.1): a device registers its push-to-start and
 * per-activity tokens, reports what happened to an activity on the phone (started locally, ended,
 * dismissed by the user), and asks for the crew-live activity on the lock screen (a Boost perk).
 */
import { z } from 'zod';

import { laKindSchema } from './la-common';

/** APNs tokens are hex; ActivityKit's are 32+ bytes. */
const apnsTokenSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{16,512}$/)
  .transform((token) => token.toLowerCase());

/** ActivityKit's `Activity.id` (a UUID string, in any case). */
const osActivityIdSchema = z.string().min(8).max(64);

export const LA_START_PATHS = ['local', 'scheduled', 'push_to_start'] as const;
export const laStartPathSchema = z.enum(LA_START_PATHS);

export const registerLaTokenPayloadSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('push_to_start'),
    activity_type: laKindSchema,
    token: apnsTokenSchema,
    apns_env: z.enum(['sandbox', 'prod']).default('prod'),
  }),
  z.object({
    kind: z.literal('update'),
    activity_type: laKindSchema,
    token: apnsTokenSchema,
    apns_env: z.enum(['sandbox', 'prod']).default('prod'),
    /** The activity on this phone the token belongs to. */
    activity_id: osActivityIdSchema,
    /** The object it shows (leave-by, meet-up, flight segment, poll, ...). */
    ref_id: z.uuid(),
    started_via: laStartPathSchema.default('local'),
  }),
]);
export type RegisterLaTokenPayload = z.infer<typeof registerLaTokenPayloadSchema>;

export const LA_REPORTED_STATES = ['active', 'stale', 'ended', 'dismissed'] as const;

export const reportLaStatePayloadSchema = z.object({
  activity_id: osActivityIdSchema,
  kind: laKindSchema,
  ref_id: z.uuid(),
  state: z.enum(LA_REPORTED_STATES),
  started_via: laStartPathSchema.default('local'),
});
export type ReportLaStatePayload = z.infer<typeof reportLaStatePayloadSchema>;

export const requestCrewLockScreenPayloadSchema = z.object({
  trip_id: z.uuid(),
  /** The meet-up to follow; defaults to the trip's next active one. */
  meetup_id: z.uuid().optional(),
});
export type RequestCrewLockScreenPayload = z.infer<typeof requestCrewLockScreenPayloadSchema>;

export interface RequestCrewLockScreenResult {
  readonly meetup_id: string;
  /** When the activity will reach every member's lock screen (now, or T−30 min). */
  readonly starts_at: string;
}
