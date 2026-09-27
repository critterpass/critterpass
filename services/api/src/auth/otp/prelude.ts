/**
 * Prelude SMS sender (docs/product-decisions.md D14: SEA SMS fallback). Same `custom_code` approach
 * as ./twilio-verify.ts — Prelude's `POST /v2/verification` accepts a 4-8 digit `custom_code`
 * (subject to Prelude's approval per their docs) so Better Auth's own generated code stays the one
 * code across every channel.
 */
import { DomainError } from '@cp/domain';

import type { HttpClient } from './whatsapp';
import type { OtpChannelAdapter } from './router';

export interface PreludeConfig {
  readonly apiKey: string;
  readonly http: HttpClient;
  readonly apiBaseUrl?: string;
}

const DEFAULT_API_BASE_URL = 'https://api.prelude.so/v2';

export function createPreludeSender(config: PreludeConfig): OtpChannelAdapter {
  const baseUrl = config.apiBaseUrl ?? DEFAULT_API_BASE_URL;
  return {
    async send({ phoneE164, code }) {
      const response = await config.http.fetch(`${baseUrl}/verification`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          target: { type: 'phone_number', value: phoneE164 },
          custom_code: code,
        }),
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new DomainError('SUPPLIER_UNAVAILABLE', {
          channel: 'prelude',
          status: response.status,
          detail,
        });
      }
      return {};
    },
  };
}
