/**
 * WhatsApp Business Cloud API client for the ops desk's number (graph.facebook.com
 * `/{phone-number-id}/messages`): a plain text message inside the 24-hour service window, the
 * approved template outside it. Every call goes through the audited supplier HTTP client and is
 * sent once (a message sent twice reaches the vendor twice). The Cloud API answers the message id
 * that later delivery statuses and replies refer to.
 */
import { z } from 'zod';

import type { SupplierHttp } from '../core/http';
import { TEMPLATE_PARAM_MAX, VENDOR_REQUEST_TEMPLATE } from './templates';

export const WHATSAPP_SUPPLIER = 'whatsapp';
export const WHATSAPP_GRAPH_URL = 'https://graph.facebook.com/v21.0';

export interface WhatsAppBusinessConfig {
  readonly phoneNumberId: string;
  readonly accessToken: string;
  readonly baseUrl?: string;
}

const sentSchema = z.object({
  messages: z.array(z.object({ id: z.string().min(1) })).min(1),
});

export interface WhatsAppSent {
  readonly waMessageId: string;
  readonly templateName: string | null;
}

export interface WhatsAppBusinessClient {
  /** Free text; valid only within 24 h of the recipient's last message. */
  sendText(toE164: string, body: string): Promise<WhatsAppSent>;
  /** The approved template carrying `body` as its variable; starts a conversation. */
  sendTemplate(toE164: string, body: string): Promise<WhatsAppSent>;
}

function firstId(reply: z.infer<typeof sentSchema>): string {
  const id = reply.messages[0]?.id;
  if (id === undefined) throw new Error('WhatsApp answered no message id');
  return id;
}

/** Cloud API recipients are digits only (country code first, no `+`). */
export function waRecipient(e164: string): string {
  const digits = e164.replace(/[^\d]/g, '');
  if (!/^\d{8,15}$/.test(digits)) throw new Error('not an E.164 number');
  return digits;
}

export function createWhatsAppBusinessClient(
  http: SupplierHttp,
  config: WhatsAppBusinessConfig,
): WhatsAppBusinessClient {
  const url = `${(config.baseUrl ?? WHATSAPP_GRAPH_URL).replace(/\/$/, '')}/${config.phoneNumberId}/messages`;
  async function send(endpoint: string, payload: Record<string, unknown>) {
    return http.sendJson(
      {
        supplier: WHATSAPP_SUPPLIER,
        endpoint,
        url,
        method: 'POST',
        headers: { Authorization: `Bearer ${config.accessToken}` },
        body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
        timeoutMs: 20_000,
      },
      sentSchema,
    );
  }
  return {
    async sendText(toE164, body) {
      const reply = await send('messages_text', {
        recipient_type: 'individual',
        to: waRecipient(toE164),
        type: 'text',
        text: { preview_url: false, body },
      });
      return { waMessageId: firstId(reply), templateName: null };
    },
    async sendTemplate(toE164, body) {
      const reply = await send('messages_template', {
        to: waRecipient(toE164),
        type: 'template',
        template: {
          name: VENDOR_REQUEST_TEMPLATE.name,
          language: { code: VENDOR_REQUEST_TEMPLATE.language },
          components: [
            {
              type: 'body',
              parameters: [{ type: 'text', text: body.slice(0, TEMPLATE_PARAM_MAX) }],
            },
          ],
        },
      });
      return { waMessageId: firstId(reply), templateName: VENDOR_REQUEST_TEMPLATE.name };
    },
  };
}
