/**
 * `POST /webhooks/revenuecat` (docs/api-contracts.md §5.8). RevenueCat sends the Authorization
 * header configured in its dashboard; it must equal our secret (constant-time compare), and when
 * a signing secret is configured the `X-RevenueCat-Webhook-Signature` HMAC must verify too. The
 * route only stores the event, once per event id, and queues `billing.apply` in the same
 * transaction: a redelivery is acknowledged and changes nothing, and nothing is granted until the
 * apply job has re-read the customer from RevenueCat.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

import { sendInTx, withSystem } from '@cp/db';
import { BILLING_QUEUES } from '@cp/domain';
import type { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type pg from 'pg';

import { rcWebhookBodySchema } from '../../billing/rc-client';

export interface RevenueCatWebhookDeps {
  readonly pool: pg.Pool;
  /** The exact Authorization header value set in RevenueCat's webhook settings. */
  readonly authorization: string;
  /** RevenueCat's webhook signing secret, when signing is turned on for the integration. */
  readonly signingSecret?: string | undefined;
  readonly now?: () => number;
}

const SIGNATURE_TOLERANCE_SECONDS = 300;

function equalConstantTime(expected: string, provided: string | undefined): boolean {
  if (provided === undefined) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** `t=<unix seconds>,v1=<hex hmac of "t.body">`, within five minutes of now. */
export function verifyRevenueCatSignature(
  secret: string,
  header: string | undefined,
  rawBody: string,
  nowMs: number,
): boolean {
  if (header === undefined) return false;
  const parts = Object.fromEntries(
    header.split(',').map((part) => {
      const [key, ...rest] = part.trim().split('=');
      return [key ?? '', rest.join('=')];
    }),
  );
  const timestamp = Number(parts['t']);
  const signature = parts['v1'];
  if (
    !Number.isFinite(timestamp) ||
    signature === undefined ||
    !/^[0-9a-f]{64}$/iu.test(signature)
  ) {
    return false;
  }
  if (Math.abs(nowMs / 1000 - timestamp) > SIGNATURE_TOLERANCE_SECONDS) return false;
  const expected = createHmac('sha256', secret).update(`${parts['t']}.${rawBody}`).digest();
  return timingSafeEqual(Buffer.from(signature, 'hex'), expected);
}

const refused = (code: string, message: string) => ({
  error: { code, message, retryable: false },
});

export function registerRevenueCatWebhook<E extends { Variables: object }>(
  app: Hono<E>,
  deps: RevenueCatWebhookDeps,
): void {
  const now = deps.now ?? (() => Date.now());
  app.post('/webhooks/revenuecat', bodyLimit({ maxSize: 256 * 1024 }), async (c) => {
    const rawBody = await c.req.text();
    if (!equalConstantTime(deps.authorization, c.req.header('authorization'))) {
      return c.json(refused('AUTH_REQUIRED', 'invalid authorization'), 401);
    }
    if (
      deps.signingSecret !== undefined &&
      !verifyRevenueCatSignature(
        deps.signingSecret,
        c.req.header('x-revenuecat-webhook-signature'),
        rawBody,
        now(),
      )
    ) {
      return c.json(refused('AUTH_REQUIRED', 'invalid signature'), 401);
    }
    let parsed;
    try {
      parsed = rcWebhookBodySchema.safeParse(JSON.parse(rawBody));
    } catch {
      return c.json(refused('VALIDATION', 'invalid JSON body'), 422);
    }
    if (!parsed.success) return c.json(refused('VALIDATION', 'not a RevenueCat event'), 422);
    const { event } = parsed.data;
    const stored = await withSystem(deps.pool, async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO billing_events (source, event_id, type, app_user_id, environment, payload,
           event_at)
         VALUES ('revenuecat', $1, $2, $3, $4, $5, $6)
         ON CONFLICT (source, event_id) DO NOTHING RETURNING id`,
        [
          event.id,
          event.type,
          event.app_user_id ?? null,
          event.environment === 'SANDBOX' ? 'sandbox' : 'production',
          JSON.stringify(parsed.data),
          event.event_timestamp_ms == null ? null : new Date(event.event_timestamp_ms),
        ],
      );
      const id = rows[0]?.id;
      if (id !== undefined) {
        await sendInTx(tx, BILLING_QUEUES.apply, { billing_event_id: id }, { singletonKey: id });
      }
      return id;
    });
    return c.json({ received: true, duplicate: stored === undefined });
  });
}
