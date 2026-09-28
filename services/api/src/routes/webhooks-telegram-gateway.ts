/**
 * Telegram Gateway delivery reports (docs/api-contracts.md §5.1): the Gateway POSTs a
 * RequestStatus object to the `callback_url` each sign-in code was sent with. A code that expired
 * undelivered (refunded) or was revoked emits `otp.channel_failed` so the app can offer SMS.
 * Authenticity: `X-Request-Signature` is hex HMAC-SHA-256 of `X-Request-Timestamp + "\n" + body`
 * keyed with SHA-256 of the Gateway token.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

import type { Hono } from 'hono';
import type pg from 'pg';

import { emitOtpChannelFailed } from '../auth/otp/channel-failed';
import type { DeliveryTrackerRedisClient } from '../auth/otp/router';

export interface TelegramGatewayWebhookDeps {
  readonly appPool: pg.Pool;
  readonly redis: DeliveryTrackerRedisClient;
  readonly token: string;
  readonly now?: () => number;
}

interface RequestStatusReport {
  readonly request_id?: string;
  readonly delivery_status?: { readonly status?: string };
}

const FAILED_STATUSES = new Set(['expired', 'revoked']);
/** Reports older than the delivery-tracking record (600 s) can no longer be correlated; newer-than-now skew allowance. */
const MAX_REPORT_AGE_SECONDS = 600;
const MAX_CLOCK_SKEW_SECONDS = 60;

export function verifyTelegramGatewaySignature(
  token: string,
  timestamp: string | undefined,
  rawBody: string,
  signature: string | undefined,
): boolean {
  if (timestamp === undefined || signature === undefined || !/^[0-9a-f]{64}$/i.test(signature)) {
    return false;
  }
  const secretKey = createHash('sha256').update(token).digest();
  const expected = createHmac('sha256', secretKey).update(`${timestamp}\n${rawBody}`).digest();
  return timingSafeEqual(Buffer.from(signature, 'hex'), expected);
}

export function registerTelegramGatewayWebhookRoutes<E extends { Variables: object }>(
  app: Hono<E>,
  deps: TelegramGatewayWebhookDeps,
): void {
  const now = deps.now ?? (() => Date.now());

  app.post('/webhooks/telegram-gateway', async (c) => {
    const rawBody = await c.req.text();
    const timestamp = c.req.header('X-Request-Timestamp');
    const signature = c.req.header('X-Request-Signature');
    if (!verifyTelegramGatewaySignature(deps.token, timestamp, rawBody, signature)) {
      return c.json(
        { error: { code: 'AUTH_REQUIRED', message: 'invalid signature', retryable: false } },
        401,
      );
    }

    let report: RequestStatusReport;
    try {
      report = JSON.parse(rawBody) as RequestStatusReport;
    } catch {
      return c.json(
        { error: { code: 'VALIDATION', message: 'invalid JSON body', retryable: false } },
        422,
      );
    }

    // Any non-200 makes the Gateway retry up to 10 times, so a stale or irrelevant report is
    // acknowledged and dropped rather than refused.
    const ageSeconds = now() / 1000 - Number(timestamp);
    const fresh = ageSeconds <= MAX_REPORT_AGE_SECONDS && ageSeconds >= -MAX_CLOCK_SKEW_SECONDS;
    const status = report.delivery_status?.status;
    if (fresh && report.request_id && status !== undefined && FAILED_STATUSES.has(status)) {
      await emitOtpChannelFailed(deps.appPool, deps.redis, report.request_id);
    }
    return c.json({ received: true }, 200);
  });
}
