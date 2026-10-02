/**
 * Help and SOS domain events (docs/api-contracts-trip.md §4.12). Payloads carry ids, enum values and
 * counts only, never a position, a message or a health note: `domain_events` is exported to
 * analytics and read crew-wide. `sos.triggered` and `sos.escalated` route the ALWAYS SOS push to
 * the crew, `sos.resolved` the ALWAYS all-clear, `help_share.started` the budgeted Help share
 * notice. A `sos.stale` SOS alerts nobody.
 */
import { z } from 'zod';

export const SAFETY_EVENT_TYPES = [
  'help_share.started',
  'help_share.stopped',
  'help_share.extended',
  'help_share.expired',
  'help_share.ending',
  'sos.triggered',
  'sos.stale',
  'sos.escalated',
  'sos.responded',
  'sos.message',
  'sos.resolved',
  'help.clinic_requested',
] as const;
export type SafetyEventType = (typeof SAFETY_EVENT_TYPES)[number];

export const SOS_RESPONSE_STATES = ['seen', 'coming', 'calling'] as const;
export const sosResponseStateSchema = z.enum(SOS_RESPONSE_STATES);
export type SosResponseState = z.infer<typeof sosResponseStateSchema>;

const share = z.object({ trip_id: z.uuid(), share_id: z.uuid(), session_id: z.uuid() });
const sos = z.object({ trip_id: z.uuid(), sos_id: z.uuid() });

export const SAFETY_EVENT_PAYLOADS = {
  'help_share.started': share.extend({ ends_at: z.iso.datetime({ offset: true }) }),
  'help_share.stopped': share,
  'help_share.extended': share.extend({ ends_at: z.iso.datetime({ offset: true }) }),
  'help_share.expired': share,
  // Ten minutes before a Help share ends: the sharer may stop it or keep sharing for longer.
  'help_share.ending': share.extend({ ends_at: z.iso.datetime({ offset: true }) }),
  'sos.triggered': sos.extend({ crew_count: z.number().int().min(0) }),
  'sos.stale': sos.extend({ age_min: z.number().int().min(0) }),
  'sos.escalated': sos,
  'sos.responded': sos.extend({ user_id: z.uuid(), state: sosResponseStateSchema }),
  'sos.message': sos.extend({ message_id: z.uuid(), sender_id: z.uuid() }),
  'sos.resolved': sos.extend({ by: z.uuid(), false_alarm: z.boolean(), alerted: z.boolean() }),
  'help.clinic_requested': z.object({
    trip_id: z.uuid(),
    session_id: z.uuid(),
    task_id: z.uuid(),
    details_consent: z.boolean(),
  }),
} as const satisfies Record<SafetyEventType, z.ZodType>;
