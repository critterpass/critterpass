/**
 * WhatsApp Cloud API authentication template sender (docs/product-decisions.md D14, phase-9 T4).
 * Tried first for every allow-listed country: the Cloud API has no reachability lookup, so "is this
 * number on WhatsApp" is only knowable by attempting the send (services/api/src/auth/otp/router.ts
 * falls back to SMS on any thrown error here).
 */
import { DomainError } from '@cp/domain';

import type { OtpChannelAdapter } from './router';

/** The fetch surface this adapter needs; injectable so tests use recorded-shape HTTP fixtures (code-standards.md §17) instead of a real Cloud API call. */
export interface HttpClient {
  fetch(input: string, init: RequestInit): Promise<Response>;
}

export interface WhatsAppSenderConfig {
  readonly phoneNumberId: string;
  readonly accessToken: string;
  /** Name of the pre-approved authentication template with a copy-code button (Meta requires template approval before send). */
  readonly templateName: string;
  readonly languageCode: string;
  readonly http: HttpClient;
  readonly graphApiBaseUrl?: string;
}

interface CloudApiMessageResponse {
  readonly messages?: ReadonlyArray<{ readonly id: string }>;
}

const DEFAULT_GRAPH_API_BASE_URL = 'https://graph.facebook.com/v21.0';

export function createWhatsAppSender(config: WhatsAppSenderConfig): OtpChannelAdapter {
  const baseUrl = config.graphApiBaseUrl ?? DEFAULT_GRAPH_API_BASE_URL;
  return {
    async send({ phoneE164, code }) {
      const response = await config.http.fetch(`${baseUrl}/${config.phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: phoneE164,
          type: 'template',
          template: {
            name: config.templateName,
            language: { code: config.languageCode },
            components: [
              { type: 'body', parameters: [{ type: 'text', text: code }] },
              {
                type: 'button',
                sub_type: 'url',
                index: '0',
                parameters: [{ type: 'text', text: code }],
              },
            ],
          },
        }),
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new DomainError('SUPPLIER_UNAVAILABLE', {
          channel: 'whatsapp',
          status: response.status,
          detail,
        });
      }
      const body = (await response.json()) as CloudApiMessageResponse;
      const providerMessageId = body.messages?.[0]?.id;
      return providerMessageId !== undefined ? { providerMessageId } : {};
    },
  };
}
