/**
 * Twilio Verify SMS sender (docs/product-decisions.md: SMS fallback outside SEA). Sends Better
 * Auth's own locally-generated code as Twilio Verify's `CustomCode` (Twilio Verify API, "Custom
 * Verification Code": 4-10 chars, enabled per-Service in the Twilio console) rather than letting
 * Twilio generate its own — this keeps one verification code and one attempt/expiry pipeline
 * (Better Auth's local comparison) across every channel, instead of duplicating Better Auth's
 * internal attempt-tracking to also call Twilio's separate verification-check endpoint.
 */
import { DomainError } from '@cp/domain';

import type { HttpClient } from './whatsapp';
import type { OtpChannelAdapter } from './router';

export interface TwilioVerifyConfig {
  readonly accountSid: string;
  readonly authToken: string;
  readonly serviceSid: string;
  readonly http: HttpClient;
  readonly apiBaseUrl?: string;
}

const DEFAULT_API_BASE_URL = 'https://verify.twilio.com/v2';

export function createTwilioVerifySender(config: TwilioVerifyConfig): OtpChannelAdapter {
  const baseUrl = config.apiBaseUrl ?? DEFAULT_API_BASE_URL;
  const basicAuth = Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64');
  return {
    async send({ phoneE164, code }) {
      const body = new URLSearchParams({ To: phoneE164, Channel: 'sms', CustomCode: code });
      const response = await config.http.fetch(
        `${baseUrl}/Services/${config.serviceSid}/Verifications`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${basicAuth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: body.toString(),
        },
      );
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new DomainError('SUPPLIER_UNAVAILABLE', {
          channel: 'twilio_verify',
          status: response.status,
          detail,
        });
      }
      return {};
    },
  };
}
