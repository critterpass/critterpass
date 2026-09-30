/**
 * The ops console's vendor desk (docs/api-contracts.md §4.17, `Ops - Desk`): WhatsApp threads with
 * places, by what the desk owes them. The approved text is read-only with its SHA-256; a person
 * sends it, sets the place's WhatsApp number, or drafts a follow-up that goes back to the traveller
 * for approval (editing a draft voids the earlier approval).
 */
import { z } from 'zod';

import { DESK_SLA_STATES } from '../admin/desk';
import { VENDOR_CHANNELS, VENDOR_MESSAGE_STATUSES, VENDOR_THREAD_STATUSES } from './state';
import { vendorTextSchema, VENDOR_REPLY_INTENTS } from './draft';

const isoDate = z.iso.datetime({ offset: true });

/** What the desk owes a thread: send an approved text, wait on the traveller, or on the place. */
export const VENDOR_DESK_VIEWS = [
  'to_send',
  'awaiting_approval',
  'waiting_reply',
  'replied',
  'closed',
] as const;
export const vendorDeskViewSchema = z.enum(VENDOR_DESK_VIEWS);
export type VendorDeskView = z.infer<typeof vendorDeskViewSchema>;

export const vendorDeskQuerySchema = z.object({ view: vendorDeskViewSchema.default('to_send') });

export const vendorDeskThreadSchema = z.object({
  thread_id: z.uuid(),
  trip_id: z.uuid(),
  vendor_name: z.string(),
  channel: z.enum(VENDOR_CHANNELS),
  status: z.enum(VENDOR_THREAD_STATUSES),
  requester_name: z.string().nullable(),
  task_id: z.uuid().nullable(),
  due_at: isoDate.nullable(),
  sla: z.enum(DESK_SLA_STATES),
  contact_set: z.boolean(),
  updated_at: isoDate,
});
export type VendorDeskThread = z.infer<typeof vendorDeskThreadSchema>;
export const vendorDeskListSchema = z.object({ items: z.array(vendorDeskThreadSchema) });

export const vendorDeskMessageSchema = z.object({
  id: z.uuid(),
  direction: z.enum(['outbound', 'inbound']),
  proposed_by: z.enum(['user', 'guide', 'ops', 'vendor']),
  body: z.string(),
  status: z.enum(VENDOR_MESSAGE_STATUSES),
  approved_at: isoDate.nullable(),
  approved_text_sha256: z.string().nullable(),
  approval_op_id: z.uuid().nullable(),
  sent_at: isoDate.nullable(),
  template_name: z.string().nullable(),
  created_at: isoDate,
  reply: z
    .object({
      intent: z.enum(VENDOR_REPLY_INTENTS),
      times: z.array(z.string()),
      prices: z.array(z.string()),
      needs_person: z.boolean(),
    })
    .nullable(),
});
export type VendorDeskMessage = z.infer<typeof vendorDeskMessageSchema>;

export const vendorDeskDetailSchema = z.object({
  thread: vendorDeskThreadSchema,
  messages: z.array(vendorDeskMessageSchema),
  notes: z.array(z.object({ at: isoDate, admin: z.string(), text: z.string() })),
  /** Whether the desk number can send now (switch on and configured). */
  desk_sends: z.boolean(),
  /** Within WhatsApp's 24 h window: free text; otherwise the approved template carries the text. */
  in_window: z.boolean(),
  desk_hours: z.object({ open: z.string(), close: z.string(), tz: z.string() }),
});
export type VendorDeskDetail = z.infer<typeof vendorDeskDetailSchema>;

export const sendVendorMessagePayloadSchema = z.object({ draft_id: z.uuid() }).strict();

export const setVendorContactPayloadSchema = z
  .object({
    thread_id: z.uuid(),
    /** The place's WhatsApp number in E.164 (`+62 812…`). */
    phone_e164: z.string().regex(/^\+[1-9][\d\s-]{7,20}$/u, 'E.164 number'),
  })
  .strict();

export const proposeVendorReplyPayloadSchema = z
  .object({ thread_id: z.uuid(), draft_id: z.uuid(), draft_text: vendorTextSchema })
  .strict();
