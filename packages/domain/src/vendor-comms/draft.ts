/**
 * Vendor drafts (docs/api-contracts.md §4.11): the guide proposes or the traveller writes a message
 * to a place ("Ask Locavore to hold a table for 6 until 21:00?"), and the traveller sees the exact
 * text before anything leaves. With WhatsApp Business live the ops desk sends it after approval;
 * otherwise the answer carries the text and a WhatsApp share link for the traveller to send it
 * from their own phone. Nothing is ever sent to a vendor by a model.
 */
import { z } from 'zod';

import type { VendorChannel, VendorMessageStatus, VendorThreadStatus } from './state';

export const VENDOR_INTENTS = ['reserve', 'ask', 'change', 'cancel', 'other'] as const;
export const vendorIntentSchema = z.enum(VENDOR_INTENTS);
export type VendorIntent = z.infer<typeof vendorIntentSchema>;

export const VENDOR_TEXT_MAX = 1000;
export const vendorTextSchema = z.string().trim().min(1).max(VENDOR_TEXT_MAX);

/** The vendor: a provider the crew added, or a place from the catalogue. */
export const vendorRefSchema = z
  .object({ kind: z.enum(['provider', 'poi']), id: z.uuid() })
  .strict();
export type VendorRef = z.infer<typeof vendorRefSchema>;

export const requestVendorMessagePayloadSchema = z
  .object({
    /** The draft id the app chose, so a replay answers the same draft. */
    draft_id: z.uuid(),
    trip_id: z.uuid(),
    vendor: vendorRefSchema,
    vendor_name: z.string().trim().min(1).max(120),
    intent: vendorIntentSchema,
    draft_text: vendorTextSchema,
  })
  .strict();
export type RequestVendorMessagePayload = z.infer<typeof requestVendorMessagePayloadSchema>;

export interface VendorShare {
  readonly text: string;
  /** Opens WhatsApp with the text filled in; the traveller picks the vendor's chat. */
  readonly wa_link: string;
}

export interface RequestVendorMessageResult {
  readonly draft_id: string;
  readonly thread_id: string;
  readonly channel: VendorChannel;
  readonly status: VendorMessageStatus;
  /** Present for `self_send`: what the traveller shares from their own WhatsApp. */
  readonly share: VendorShare | null;
}

export const approveVendorMessagePayloadSchema = z
  .object({
    draft_id: z.uuid(),
    /** The text exactly as the traveller saw it; a different text is not approved. */
    text: vendorTextSchema,
  })
  .strict();
export type ApproveVendorMessagePayload = z.infer<typeof approveVendorMessagePayloadSchema>;

export interface DeskHours {
  readonly open: string;
  readonly close: string;
  readonly tz: string;
}

export interface ApproveVendorMessageResult {
  readonly draft_id: string;
  readonly status: VendorMessageStatus;
  readonly task_id: string;
  /** The desk's staffed hours, so the card can say when it will be sent. */
  readonly desk_hours: DeskHours;
}

/** The share link for a self-sent draft (`https://wa.me/?text=`, no number needed). */
export function whatsappShareLink(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export const VENDOR_REPLY_INTENTS = ['yes', 'no', 'counter', 'question', 'unclear'] as const;
export type VendorReplyIntent = (typeof VENDOR_REPLY_INTENTS)[number];

/** A parsed reply: the intent, and times and prices that appear verbatim in the reply. */
export interface VendorReplyView {
  readonly intent: VendorReplyIntent;
  readonly times: readonly string[];
  readonly prices: readonly string[];
  /** Below the route's confidence floor: a person at the desk reads it. */
  readonly needs_person: boolean;
}

/** A thread as the traveller sees it (read through the api; `ops.*` is never synced). */
export interface VendorThreadView {
  readonly thread_id: string;
  readonly vendor_name: string;
  readonly channel: VendorChannel;
  readonly status: VendorThreadStatus;
  readonly messages: readonly {
    readonly id: string;
    readonly direction: 'outbound' | 'inbound';
    /** Verbatim: the approved text, or the vendor's reply exactly as received. */
    readonly body: string;
    readonly status: VendorMessageStatus;
    readonly at: string;
    readonly reply: VendorReplyView | null;
  }[];
}
