/**
 * WhatsApp Cloud API webhook (docs/api-contracts.md §5.1): the `GET` verify-token
 * handshake Meta performs once when the webhook URL is registered, and the signed `POST` status
 * callback used to detect an undelivered authentication-template message and offer SMS instead.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

import { enqueueRealtime, withSystem } from '@cp/db';
import { userChannel } from '@cp/domain';
import type { Hono } from 'hono';
import type pg from 'pg';

import {
  findDeliveryByProviderMessageId,
  type DeliveryTrackerRedisClient,
} from '../auth/otp/router';

export interface WhatsAppWebhookDeps {
  readonly appPool: pg.Pool;
  readonly redis: DeliveryTrackerRedisClient;
  readonly appSecret: string;
  readonly verifyToken: string;
}

interface StatusEntryValue {
  readonly statuses?: ReadonlyArray<{
    readonly id: string;
    readonly status: string;
  }>;
}

interface WebhookPayload {
  readonly entry?: ReadonlyArray<{
    readonly changes?: ReadonlyArray<{ readonly value?: StatusEntryValue }>;
  }>;
}

const FAILED_STATUSES = new Set(['failed', 'undelivered']);

function verifySignature(appSecret: string, rawBody: string, header: string | undefined): boolean {
  if (!header) return false;
  const prefix = 'sha256=';
  if (!header.startsWith(prefix)) return false;
  const provided = header.slice(prefix.length);
  const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const providedBuffer = Buffer.from(provided, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  if (providedBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(providedBuffer, expectedBuffer);
}

export function registerWhatsAppWebhookRoutes<E extends { Variables: object }>(
  app: Hono<E>,
  deps: WhatsAppWebhookDeps,
): void {
  app.get('/webhooks/whatsapp', (c) => {
    const mode = c.req.query('hub.mode');
    const token = c.req.query('hub.verify_token');
    const challenge = c.req.query('hub.challenge');
    if (mode === 'subscribe' && token === deps.verifyToken && challenge !== undefined) {
      return c.text(challenge, 200);
    }
    return c.text('forbidden', 403);
  });

  app.post('/webhooks/whatsapp', async (c) => {
    const rawBody = await c.req.text();
    const signature = c.req.header('X-Hub-Signature-256');
    if (!verifySignature(deps.appSecret, rawBody, signature)) {
      return c.json(
        { error: { code: 'AUTH_REQUIRED', message: 'invalid signature', retryable: false } },
        401,
      );
    }

    let payload: WebhookPayload;
    try {
      payload = JSON.parse(rawBody) as WebhookPayload;
    } catch {
      return c.json(
        { error: { code: 'VALIDATION', message: 'invalid JSON body', retryable: false } },
        422,
      );
    }

    const statuses = (payload.entry ?? []).flatMap((entry) =>
      (entry.changes ?? []).flatMap((change) => change.value?.statuses ?? []),
    );

    for (const status of statuses) {
      if (!FAILED_STATUSES.has(status.status)) continue;
      const delivery = await findDeliveryByProviderMessageId(deps.redis, status.id);
      if (!delivery || !delivery.uid) continue;
      await withSystem(deps.appPool, (tx) =>
        enqueueRealtime(tx, {
          channel: userChannel(delivery.uid as string),
          payload: {
            v: 1,
            type: 'otp.channel_failed',
            data: { verification_id: delivery.verificationId ?? null },
          },
        }),
      );
    }

    // Meta requires a fast 200 regardless of per-status outcome; retries are keyed by delivery
    // (Meta) not by our processing, so there is nothing useful a non-200 status would communicate.
    return c.json({ received: true }, 200);
  });
}
