/**
 * Telegram Gateway sender (docs/product-decisions.md: the second channel, after WhatsApp and
 * before SMS). One billable call per sign-in: `sendVerificationMessage` with Better Auth's own
 * code (the Gateway accepts a 4-8 digit `code`), never preceded by `checkSendAbility` — that check
 * charges in advance on success, and a direct send already costs nothing when it errors (for
 * example a number that cannot receive codes), which is when the router falls through to SMS.
 * A code not delivered or read within `ttl` is refunded and reported as `expired` to
 * `callback_url` (services/api/src/routes/webhooks-telegram-gateway.ts).
 */
import { DomainError } from '@cp/domain';

import type { HttpClient } from './whatsapp';
import type { OtpChannelAdapter } from './router';

export interface TelegramGatewayConfig {
  readonly token: string;
  readonly http: HttpClient;
  /** HTTPS delivery-report URL; omitted when the deployment has no public HTTPS origin (local dev). */
  readonly callbackUrl?: string;
  readonly apiBaseUrl?: string;
}

interface GatewayResponse {
  readonly ok?: boolean;
  readonly error?: string;
  readonly result?: { readonly request_id?: string };
}

const DEFAULT_API_BASE_URL = 'https://gatewayapi.telegram.org';

/**
 * Seconds before an undelivered code expires and its fee is refunded (Gateway range 30-3600).
 * Shorter than the 300 s code lifetime so an unread Telegram code turns into the SMS offer
 * (`otp.channel_failed`) while the code can still be used.
 */
export const TELEGRAM_CODE_TTL_SECONDS = 60;

export function createTelegramGatewaySender(config: TelegramGatewayConfig): OtpChannelAdapter {
  const baseUrl = config.apiBaseUrl ?? DEFAULT_API_BASE_URL;
  return {
    async send({ phoneE164, code }) {
      const response = await config.http.fetch(`${baseUrl}/sendVerificationMessage`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone_number: phoneE164,
          code,
          ttl: TELEGRAM_CODE_TTL_SECONDS,
          ...(config.callbackUrl !== undefined ? { callback_url: config.callbackUrl } : {}),
        }),
      });
      const body = (await response.json().catch(() => ({}))) as GatewayResponse;
      const requestId = body.result?.request_id;
      if (!response.ok || body.ok !== true || requestId === undefined) {
        throw new DomainError('SUPPLIER_UNAVAILABLE', {
          channel: 'telegram',
          status: response.status,
          detail: body.error ?? '',
        });
      }
      return { providerMessageId: requestId };
    },
  };
}
