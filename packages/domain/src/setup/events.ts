/**
 * Trip setup domain events (docs/api-contracts.md §4.5). Payloads carry ids, enums and counts
 * only: never a calendar day, a budget amount, a must-do's words or a dietary detail. The budget
 * submission event is a count and nothing else.
 */
import { z } from 'zod';

import { tripSetupStepSchema } from '../enums/trip';
import { askAnswerSchema, calendarSourceKindSchema } from './availability';

export const FIT_STATUS_VALUES = ['fits', 'tight', 'clash', 'unknown'] as const;
export const mustDoFitStatusSchema = z.enum(FIT_STATUS_VALUES);
export type MustDoFitStatus = z.infer<typeof mustDoFitStatusSchema>;

export const SETUP_EVENT_TYPES = [
  'availability.updated',
  'calendar.connected',
  'calendar.disconnected',
  'calendar.stale',
  'availability_ask.created',
  'availability_ask.answered',
  'availability_ask.timed_out',
  'setup.step_changed',
  'budget.submission_counted',
  'budget.locked',
  'rooms.changed',
  'rooms.locked',
  'room_swap.requested',
  'stay.chosen',
  'must_dos.changed',
  'must_do.fit_checked',
  'must_do.prompted',
  'lottery.tracked',
  'lottery.reminder_due',
] as const;
export type SetupEventType = (typeof SETUP_EVENT_TYPES)[number];

const trip = z.object({ trip_id: z.uuid() });
const tripUser = trip.extend({ user_id: z.uuid() });
const ask = trip.extend({ ask_id: z.uuid(), target_user_id: z.uuid() });
const source = z.object({ user_id: z.uuid(), source_id: z.uuid(), kind: calendarSourceKindSchema });

export const SETUP_EVENT_PAYLOADS = {
  // Aggregate is the member; which trips' summaries move, never which days.
  'availability.updated': z.object({
    user_id: z.uuid(),
    trip_ids: z.array(z.uuid()),
    days_count: z.number().int().nonnegative(),
  }),
  'calendar.connected': source,
  'calendar.disconnected': source,
  // The stale-calendar nudge (missing or older than the stale window), once per stale period.
  'calendar.stale': tripUser.extend({ reason: z.enum(['missing', 'stale']) }),
  'availability_ask.created': ask,
  'availability_ask.answered': ask.extend({ answer: askAnswerSchema }),
  'availability_ask.timed_out': ask,
  'setup.step_changed': trip.extend({
    from: tripSetupStepSchema.nullable(),
    to: tripSetupStepSchema,
  }),
  // Count only: the crew learns that one more max is in, never whose or how much.
  'budget.submission_counted': trip.extend({ maxes_count: z.number().int().nonnegative() }),
  'budget.locked': trip.extend({ checked_against_band: z.boolean() }),
  'rooms.changed': trip.extend({ version: z.number().int().positive() }),
  'rooms.locked': trip,
  'room_swap.requested': tripUser.extend({ with_user_id: z.uuid().nullable() }),
  'stay.chosen': trip.extend({ stay_option_id: z.string().max(80) }),
  'must_dos.changed': tripUser.extend({ must_do_ids: z.array(z.uuid()) }),
  'must_do.fit_checked': trip.extend({ must_do_id: z.uuid(), fit_status: mustDoFitStatusSchema }),
  // The "what's the one thing" prompt, once per member per trip.
  'must_do.prompted': tripUser,
  'lottery.tracked': tripUser.extend({ must_do_id: z.uuid() }),
  'lottery.reminder_due': tripUser.extend({
    must_do_id: z.uuid(),
    slot: z.enum(['deadline', 'result']),
  }),
} as const satisfies Record<SetupEventType, z.ZodType>;
