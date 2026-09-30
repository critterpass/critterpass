/**
 * Trip day domain events. Payloads carry ids, enum values and counts only: `domain_events` is
 * exported to analytics.
 */
import { z } from 'zod';

import { briefingActionSchema } from './briefing';
import { leaveByStateSchema } from './leave-by';
import { readinessSourceSchema, readinessStateSchema } from './readiness';

export const TRIP_DAY_EVENT_TYPES = [
  'leave_by.changed',
  'leave_by.alarm_due',
  'leave_by.snoozed',
  'leave_by.knocked',
  'readiness.changed',
  'packing.checked',
  'briefing.built',
  'briefing.item_acted',
  'member.running_late',
] as const;
export type TripDayEventType = (typeof TRIP_DAY_EVENT_TYPES)[number];

const leaveBy = z.object({ trip_id: z.uuid(), leave_by_id: z.uuid() });

export const TRIP_DAY_EVENT_PAYLOADS = {
  'leave_by.changed': leaveBy.extend({
    leave_at: z.iso.datetime({ offset: true }),
    state: leaveByStateSchema,
  }),
  // The remote copy of the alarm for members whose device never confirmed one.
  'leave_by.alarm_due': leaveBy.extend({ user_ids: z.array(z.uuid()).min(1) }),
  'leave_by.snoozed': leaveBy.extend({ user_id: z.uuid(), count: z.number().int().min(1) }),
  // The crew knock goes to every member already up; appended once per sleeper.
  'leave_by.knocked': leaveBy.extend({ user_id: z.uuid(), reason: z.enum(['snooze', 'late']) }),
  'readiness.changed': leaveBy.extend({
    user_id: z.uuid(),
    state: readinessStateSchema,
    source: readinessSourceSchema,
  }),
  'packing.checked': z.object({
    trip_id: z.uuid(),
    item_id: z.uuid(),
    user_id: z.uuid(),
    checked: z.boolean(),
  }),
  'briefing.built': z.object({
    trip_id: z.uuid(),
    user_id: z.uuid(),
    briefing_id: z.uuid(),
    item_count: z.number().int().min(0),
    fallback_used: z.boolean(),
  }),
  'briefing.item_acted': z.object({
    trip_id: z.uuid(),
    user_id: z.uuid(),
    item_id: z.uuid(),
    action: briefingActionSchema,
  }),
  // The crew ping goes to the trip's other members.
  'member.running_late': z.object({
    trip_id: z.uuid(),
    user_id: z.uuid(),
    minutes: z.number().int().min(1),
    item_id: z.uuid().nullable(),
    meetup_id: z.uuid().nullable(),
  }),
} as const satisfies Record<TripDayEventType, z.ZodType>;
