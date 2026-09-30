/**
 * The RevenueCat webhook stores each event once and nothing else: a wrong or missing
 * Authorization header, or a bad signature, is refused before anything is written; a redelivery
 * is acknowledged and stores nothing new; and only `billing.apply` (through the internal door the
 * worker calls) changes purchase state, after re-reading the customer from RevenueCat.
 */
import { createHmac } from 'node:crypto';

import { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  registerRevenueCatWebhook,
  verifyRevenueCatSignature,
} from '../../src/routes/webhooks/revenuecat';
import {
  DOOR_SECRET,
  loadFixture,
  startBillingHarness,
  stateOf,
  WEBHOOK_AUTH,
  type BillingHarness,
} from './billing-harness';

let harness: BillingHarness;

beforeAll(async () => {
  harness = await startBillingHarness();
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

const post = (body: unknown, headers: Record<string, string>) =>
  harness.request('/webhooks/revenuecat', { method: 'POST', headers, body: JSON.stringify(body) });

async function storedCount(eventId: string): Promise<number> {
  const { rows } = await harness.pool.query(
    "SELECT 1 FROM billing_events WHERE source = 'revenuecat' AND event_id = $1",
    [eventId],
  );
  return rows.length;
}

describe('POST /webhooks/revenuecat', () => {
  it('refuses a missing or wrong authorization and stores nothing', async () => {
    const user = await harness.signIn();
    const [step] = loadFixture('pass-refund', user.uid).steps;
    expect((await post(step!.webhook, {})).status).toBe(401);
    expect((await post(step!.webhook, { authorization: `${WEBHOOK_AUTH}x` })).status).toBe(401);
    expect(await storedCount(step!.webhook.event.id)).toBe(0);
  });

  it('stores an event once and queues one apply; a redelivery changes nothing', async () => {
    const user = await harness.signIn();
    const [step] = loadFixture('pass-refund', user.uid).steps;
    const body = { ...step!.webhook, event: { ...step!.webhook.event, id: `evt-${user.uid}` } };
    const first = await post(body, { authorization: WEBHOOK_AUTH });
    expect(await first.json()).toEqual({ received: true, duplicate: false });
    const second = await post(body, { authorization: WEBHOOK_AUTH });
    expect(await second.json()).toEqual({ received: true, duplicate: true });
    expect(await storedCount(body.event.id)).toBe(1);
    const jobs = await harness.pool.query(
      "SELECT 1 FROM pgboss.job WHERE name = 'billing.apply' AND data->>'billing_event_id' IN (SELECT id::text FROM billing_events WHERE event_id = $1)",
      [body.event.id],
    );
    expect(jobs.rows).toHaveLength(1);
    // Storing is all the webhook does: no Pass+ before the apply step re-reads the customer.
    expect((await stateOf(harness.pool, user.uid)).passPlus).toBe(false);

    harness.revenuecat.set(user.uid, step!.subscriber);
    const { rows } = await harness.pool.query<{ id: string }>(
      'SELECT id FROM billing_events WHERE event_id = $1',
      [body.event.id],
    );
    const door = (secret: string) =>
      harness.request('/internal/billing/apply_event', {
        method: 'POST',
        headers: { 'x-cp-billing-secret': secret },
        body: JSON.stringify({ billing_event_id: rows[0]!.id }),
      });
    expect((await door('not-the-door-secret-000000')).status).toBe(401);
    const applied = await door(DOOR_SECRET);
    expect(await applied.json()).toMatchObject({ result: { outcome: 'applied' } });
    expect((await stateOf(harness.pool, user.uid)).passPlus).toBe(true);
    expect(await (await door(DOOR_SECRET)).json()).toMatchObject({
      result: { outcome: 'duplicate' },
    });
  });

  it('checks the signature when signing is on', async () => {
    const secret = 'sign'.repeat(7);
    const app = new Hono<{ Variables: object }>();
    registerRevenueCatWebhook(app, {
      pool: harness.pool,
      authorization: WEBHOOK_AUTH,
      signingSecret: secret,
    });
    const body = JSON.stringify({ event: { id: 'evt-signed-unsent', type: 'TEST' } });
    const t = Math.floor(Date.now() / 1000);
    const sign = (at: number, payload: string) =>
      `t=${at},v1=${createHmac('sha256', secret).update(`${at}.${payload}`).digest('hex')}`;
    expect(verifyRevenueCatSignature(secret, sign(t, body), body, Date.now())).toBe(true);
    expect(verifyRevenueCatSignature(secret, sign(t, `${body} `), body, Date.now())).toBe(false);
    expect(verifyRevenueCatSignature(secret, sign(t - 600, body), body, Date.now())).toBe(false);
    const refused = await app.request('/webhooks/revenuecat', {
      method: 'POST',
      headers: {
        authorization: WEBHOOK_AUTH,
        'x-revenuecat-webhook-signature': sign(t - 600, body),
      },
      body,
    });
    expect(refused.status).toBe(401);
    expect(await storedCount('evt-signed-unsent')).toBe(0);
  });
});
