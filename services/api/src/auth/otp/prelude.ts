/**
 * Prelude SMS sender (docs/product-decisions.md: the SMS channel for every allow-listed country,
 * last in the order). Prelude's `POST /v2/verification` accepts a 4-8 digit `options.custom_code`
 * (once Prelude has enabled custom codes for the account; until then it silently sends its own
 * code, which Better Auth cannot verify) so Better Auth's own generated code stays the one
 * code across every channel, and Better Auth's local comparison stays the one attempt/expiry
 * pipeline.
 */
import { DomainError } from '@cp/domain';

import type { HttpClient } from './whatsapp';
import type { OtpChannelAdapter } from './router';

export interface PreludeConfig {
  readonly apiKey: string;
  readonly http: HttpClient;
  readonly apiBaseUrl?: string;
}

const DEFAULT_API_BASE_URL = 'https://api.prelude.dev/v2';
const SENT_STATUSES: ReadonlySet<string> = new Set(['success', 'retry', 'shadow_blocked']);

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
          options: { custom_code: code },
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
      // Prelude answers 200 whatever it decided. "success" opens a verification window and "retry"
      // is a new attempt inside an open one (a resend), both sent; "shadow_blocked" only dry-runs a
      // block rule, so the message still goes out. "blocked" sends nothing, and "challenged" is
      // limited to non-SMS channels this account doesn't route, so both fall through as failures.
      const body = (await response.json().catch(() => null)) as { status?: unknown } | null;
      if (typeof body?.status !== 'string' || !SENT_STATUSES.has(body.status)) {
        throw new DomainError('SUPPLIER_UNAVAILABLE', {
          channel: 'prelude',
          status: response.status,
          detail: typeof body?.status === 'string' ? body.status : 'unexpected response',
        });
      }
      return {};
    },
  };
}
