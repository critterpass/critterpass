/**
 * A vendor message's life (docs/product-decisions.md D10: WhatsApp only after the traveller approved
 * the exact text). An outbound draft is approved by its requester, then sent by a person at the ops
 * desk; WhatsApp reports delivery and reading. A newer draft supersedes an unsent one. An inbound
 * message is a vendor's reply, always untrusted text.
 */
import { z } from 'zod';

export const VENDOR_MESSAGE_STATUSES = [
  'draft',
  'approved',
  'sent',
  'delivered',
  'read',
  'failed',
  'superseded',
  'received',
] as const;
export const vendorMessageStatusSchema = z.enum(VENDOR_MESSAGE_STATUSES);
export type VendorMessageStatus = z.infer<typeof vendorMessageStatusSchema>;

export const VENDOR_MESSAGE_TRANSITIONS: Readonly<
  Record<VendorMessageStatus, readonly VendorMessageStatus[]>
> = {
  draft: ['approved', 'superseded'],
  approved: ['sent', 'failed', 'superseded'],
  sent: ['delivered', 'read', 'failed'],
  delivered: ['read', 'failed'],
  read: [],
  failed: [],
  superseded: [],
  received: [],
};

export function canMoveVendorMessage(from: VendorMessageStatus, to: VendorMessageStatus): boolean {
  return VENDOR_MESSAGE_TRANSITIONS[from].includes(to);
}

/** Statuses that mean the text left us: only ever with an approval matching it (DB-enforced too). */
export const VENDOR_MESSAGE_OUT_STATUSES: readonly VendorMessageStatus[] = [
  'sent',
  'delivered',
  'read',
];

export const VENDOR_THREAD_STATUSES = ['open', 'waiting_reply', 'replied', 'closed'] as const;
export type VendorThreadStatus = (typeof VENDOR_THREAD_STATUSES)[number];

/**
 * How a draft leaves: the ops desk sends it through WhatsApp Business once approved, or, while the
 * WhatsApp Business account is not live, the traveller sends it from their own WhatsApp.
 */
export const VENDOR_CHANNELS = ['whatsapp_business', 'self_send'] as const;
export type VendorChannel = (typeof VENDOR_CHANNELS)[number];
