/**
 * Critter domain events. Payloads carry ids and enums only: no place, no time, no coordinate
 * (`domain_events` is exported to analytics and read crew-wide).
 */
import { z } from 'zod';

import { hatchTriggerSchema } from './commands';

export const CRITTER_EVENT_TYPES = [
  'egg.granted',
  'egg.hatched',
  'encounter.started',
  'critter.befriended',
  'critter.revoked',
  'copresence.completed',
  'legendary.reminder_set',
  'legendary.reminder_due',
] as const;
export type CritterEventType = (typeof CRITTER_EVENT_TYPES)[number];

const egg = z.object({ trip_id: z.uuid(), user_id: z.uuid(), egg_id: z.uuid() });

export const CRITTER_EVENT_PAYLOADS = {
  'egg.granted': egg,
  'egg.hatched': egg.extend({ form_id: z.uuid(), trigger: hatchTriggerSchema }),
  'encounter.started': z.object({
    trip_id: z.uuid(),
    user_id: z.uuid(),
    encounter_id: z.uuid(),
    spawn_rule_id: z.uuid(),
  }),
  // A verified find (hatch, encounter, co-presence or a grant) entering the dex.
  'critter.befriended': z.object({
    trip_id: z.uuid().nullable(),
    user_id: z.uuid(),
    entry_id: z.uuid(),
    form_id: z.uuid(),
    critter_id: z.uuid(),
    source: z.enum(['hatch', 'encounter', 'quest', 'grant']),
    first_in_crew: z.boolean(),
  }),
  'critter.revoked': z.object({
    trip_id: z.uuid().nullable(),
    user_id: z.uuid(),
    encounter_id: z.uuid(),
    form_id: z.uuid(),
  }),
  'copresence.completed': z.object({
    trip_id: z.uuid(),
    spawn_rule_id: z.uuid(),
    form_id: z.uuid(),
    user_ids: z.array(z.uuid()).min(1),
  }),
  'legendary.reminder_set': z.object({
    user_id: z.uuid(),
    window_id: z.uuid(),
    on: z.boolean(),
  }),
  'legendary.reminder_due': z.object({
    user_id: z.uuid(),
    window_id: z.uuid(),
    reminder_id: z.uuid(),
  }),
} as const satisfies Record<CritterEventType, z.ZodType>;
