/**
 * WhatsApp Cloud API webhooks (developers.facebook.com/docs/whatsapp/cloud-api/webhooks): every
 * `POST` is signed `X-Hub-Signature-256: sha256=<HMAC-SHA256 of the raw body with the app secret>`,
 * checked in constant time before the body is even parsed. The payload carries inbound messages
 * (the vendor's replies, text only here; anything else is kept as a note that a person must look)
 * and delivery statuses of what we sent.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

import { z } from 'zod';

export function verifyWhatsAppSignature(
  appSecret: string,
  rawBody: string,
  header: string | undefined,
): boolean {
  if (header === undefined || !header.startsWith('sha256=')) return false;
  const provided = Buffer.from(header.slice('sha256='.length), 'hex');
  const expected = createHmac('sha256', appSecret).update(rawBody).digest();
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

const messageSchema = z.object({
  from: z.string(),
  id: z.string(),
  timestamp: z.string(),
  type: z.string(),
  text: z.object({ body: z.string() }).optional(),
});
const statusSchema = z.object({
  id: z.string(),
  status: z.string(),
  timestamp: z.string(),
  errors: z
    .array(z.object({ code: z.number().optional(), title: z.string().optional() }))
    .optional(),
});
const payloadSchema = z.object({
  object: z.string(),
  entry: z.array(
    z.object({
      changes: z.array(
        z.object({
          field: z.string(),
          value: z.object({
            metadata: z.object({ phone_number_id: z.string() }).optional(),
            messages: z.array(messageSchema).optional(),
            statuses: z.array(statusSchema).optional(),
          }),
        }),
      ),
    }),
  ),
});

export interface WhatsAppInbound {
  /** The sender's WhatsApp id: their number, digits only. */
  readonly from: string;
  readonly waMessageId: string;
  readonly at: Date;
  /** The text as sent, or null for media and other types. */
  readonly text: string | null;
  readonly type: string;
}

export interface WhatsAppStatus {
  readonly waMessageId: string;
  readonly status: 'sent' | 'delivered' | 'read' | 'failed';
  readonly at: Date;
  readonly errorCode: number | null;
}

export interface WhatsAppWebhook {
  readonly phoneNumberId: string | null;
  readonly messages: readonly WhatsAppInbound[];
  readonly statuses: readonly WhatsAppStatus[];
}

const KNOWN_STATUSES = new Set(['sent', 'delivered', 'read', 'failed']);

function at(timestamp: string): Date {
  const seconds = Number(timestamp);
  return Number.isFinite(seconds) ? new Date(seconds * 1000) : new Date(Number.NaN);
}

/** Parses a verified body; null when it is not a WhatsApp Business payload. */
export function parseWhatsAppWebhook(rawBody: string): WhatsAppWebhook | null {
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return null;
  }
  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success || parsed.data.object !== 'whatsapp_business_account') return null;
  const values = parsed.data.entry.flatMap((entry) =>
    entry.changes.filter((change) => change.field === 'messages').map((change) => change.value),
  );
  return {
    phoneNumberId: values.find((value) => value.metadata)?.metadata?.phone_number_id ?? null,
    messages: values.flatMap((value) =>
      (value.messages ?? []).map((message) => ({
        from: message.from,
        waMessageId: message.id,
        at: at(message.timestamp),
        text: message.type === 'text' ? (message.text?.body ?? null) : null,
        type: message.type,
      })),
    ),
    statuses: values.flatMap((value) =>
      (value.statuses ?? [])
        .filter((status) => KNOWN_STATUSES.has(status.status))
        .map((status) => ({
          waMessageId: status.id,
          status: status.status as WhatsAppStatus['status'],
          at: at(status.timestamp),
          errorCode: status.errors?.[0]?.code ?? null,
        })),
    ),
  };
}
