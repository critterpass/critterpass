/**
 * Vendor message, concierge and entry reminder events (docs/api-contracts.md §4.11). Payloads carry
 * ids and enum values only: never the message text, a vendor's number or a reply.
 */
import { z } from 'zod';

import { VENDOR_CHANNELS } from './state';

export const VENDOR_EVENT_TYPES = [
  'vendor_msg.drafted',
  'vendor_msg.approved',
  'vendor_msg.sent',
  'vendor_msg.failed',
  'vendor_msg.replied',
  'vendor_msg.reply_parsed',
  'concierge.requested',
  'lottery.reminders_set',
] as const;
export type VendorEventType = (typeof VENDOR_EVENT_TYPES)[number];

const message = z.object({ trip_id: z.uuid(), thread_id: z.uuid(), message_id: z.uuid() });

export const VENDOR_EVENT_PAYLOADS = {
  'vendor_msg.drafted': message.extend({ channel: z.enum(VENDOR_CHANNELS) }),
  'vendor_msg.approved': message.extend({ task_id: z.uuid() }),
  'vendor_msg.sent': message,
  'vendor_msg.failed': message,
  'vendor_msg.replied': message,
  'vendor_msg.reply_parsed': message.extend({
    intent: z.enum(['yes', 'no', 'counter', 'question', 'unclear']),
    needs_person: z.boolean(),
  }),
  'concierge.requested': z.object({
    trip_id: z.uuid(),
    task_id: z.uuid(),
    kind: z.enum(['clinic', 'vendor', 'other']),
  }),
  'lottery.reminders_set': z.object({
    trip_id: z.uuid(),
    must_do_id: z.uuid(),
    participants: z.number().int().min(1),
  }),
} as const satisfies Record<VendorEventType, z.ZodType>;
