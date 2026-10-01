/**
 * Live Activity domain events. Ids and enum values only: `domain_events` is exported to analytics,
 * and a token is never an event field.
 */
import { z } from 'zod';

import { laKindSchema } from './la-common';
import { LA_REPORTED_STATES } from './la-commands';

export const LA_EVENT_TYPES = [
  'la.token_registered',
  'la.state_reported',
  'la.crew_requested',
] as const;
export type LaEventType = (typeof LA_EVENT_TYPES)[number];

export const LA_EVENT_PAYLOADS = {
  'la.token_registered': z.object({
    user_id: z.uuid(),
    device_id: z.uuid(),
    activity_type: laKindSchema,
    kind: z.enum(['push_to_start', 'update']),
  }),
  'la.state_reported': z.object({
    user_id: z.uuid(),
    device_id: z.uuid(),
    activity_type: laKindSchema,
    ref_id: z.uuid(),
    state: z.enum(LA_REPORTED_STATES),
  }),
  'la.crew_requested': z.object({
    trip_id: z.uuid(),
    meetup_id: z.uuid(),
    user_id: z.uuid(),
  }),
} as const satisfies Record<LaEventType, z.ZodType>;
