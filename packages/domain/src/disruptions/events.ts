/**
 * Disruption domain events (docs/api-contracts-async.md §2.2). Payloads carry ids, enum values and
 * counts only: `domain_events` is exported to analytics.
 */
import { z } from 'zod';

import { disruptionCauseSchema, disruptionKindSchema, watchStatusSchema } from './status';

export const DISRUPTION_EVENT_TYPES = [
  'disruption.detected',
  'disruption.needs_yes',
  'disruption.updated',
  'disruption.resolved',
  'disruption.action_decided',
  'disruption.undone',
  'disruption.announced',
  'running_late.detected',
  'late_option.chosen',
  'watch.escalated',
  'weather.suggested',
  'weather.suggestion_dismissed',
  'storm.decided',
] as const;
export type DisruptionEventType = (typeof DISRUPTION_EVENT_TYPES)[number];

const disruption = z.object({ trip_id: z.uuid(), disruption_id: z.uuid() });
const changeSet = z.object({ trip_id: z.uuid(), change_set_id: z.uuid() });

export const DISRUPTION_EVENT_PAYLOADS = {
  'disruption.detected': disruption.extend({
    kind: disruptionKindSchema,
    cause: disruptionCauseSchema,
    version: z.number().int().min(1),
    done: z.number().int().min(0),
    needs_yes: z.number().int().min(0),
  }),
  'disruption.needs_yes': disruption.extend({
    action_id: z.uuid(),
    affected: z.number().int().min(0),
  }),
  'disruption.updated': disruption.extend({ version: z.number().int().min(1) }),
  'disruption.resolved': disruption.extend({
    status: z.enum(['resolved', 'withdrawn', 'undone']),
  }),
  'disruption.action_decided': disruption.extend({
    action_id: z.uuid(),
    decision: z.enum(['approve', 'keep']),
  }),
  'disruption.undone': disruption.extend({
    undone: z.number().int().min(0),
    compensations: z.number().int().min(0),
  }),
  'disruption.announced': disruption.extend({ message_id: z.uuid() }),
  'running_late.detected': disruption.extend({
    plan_item_id: z.uuid(),
    late_min: z.number().int(),
  }),
  'late_option.chosen': disruption.extend({
    option: z.enum(['push', 'walk', 'skip', 'car']),
  }),
  'watch.escalated': z.object({
    trip_id: z.uuid(),
    watch_item_id: z.uuid(),
    status: watchStatusSchema,
    plan_changing: z.boolean(),
  }),
  'weather.suggested': changeSet.extend({ plan_item_id: z.uuid() }),
  'weather.suggestion_dismissed': changeSet,
  'storm.decided': disruption.extend({
    poll_id: z.uuid(),
    option: z.enum(['swap', 'keep', 'skip']),
  }),
} as const satisfies Record<DisruptionEventType, z.ZodType>;
