/**
 * The server's own billing grace. A failed renewal keeps Pass+ until 7 days after the store first
 * failed to bill (or the configured `billing.grace_days`), whatever the store's own grace; the
 * nightly reconcile ends a grace nobody reported the end of, and running it twice changes nothing.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { reconcileBatch } from '../../src/billing/reconcile';
import {
  apply,
  loadFixture,
  startBillingHarness,
  stateOf,
  storeEvent,
  type BillingHarness,
} from './billing-harness';

let harness: BillingHarness;

beforeAll(async () => {
  harness = await startBillingHarness();
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

async function inGrace(): Promise<string> {
  const user = await harness.signIn();
  const steps = loadFixture('pass-app-store-lifecycle', user.uid).steps;
  const billingIssue = steps.find((step) => step.webhook.event['type'] === 'BILLING_ISSUE')!;
  harness.revenuecat.set(user.uid, billingIssue.subscriber);
  await apply(harness, await storeEvent(harness, billingIssue.webhook), new Date(billingIssue.now));
  return user.uid;
}

describe('billing grace', () => {
  it('keeps Pass+ through the grace, then the reconcile ends it without a webhook', async () => {
    const uid = await inGrace();
    expect(await stateOf(harness.pool, uid)).toMatchObject({
      subscriptions: { pass_monthly: { status: 'grace', grace: '2026-12-08T00:10:00.000Z' } },
      passPlus: true,
    });
    const reconcile = (now: string) =>
      reconcileBatch(
        { pool: harness.pool, revenuecat: harness.revenuecat.client(), now: () => new Date(now) },
        null,
        200,
      );
    const within = await reconcile('2026-12-05T00:00:00Z');
    expect(within.failed).toBe(0);
    expect((await stateOf(harness.pool, uid)).passPlus).toBe(true);

    const past = await reconcile('2026-12-08T01:00:00Z');
    expect(past.drifted).toBeGreaterThanOrEqual(1);
    expect(await stateOf(harness.pool, uid)).toMatchObject({
      subscriptions: { pass_monthly: { status: 'billing_retry' } },
      passPlus: false,
    });
    const before = await stateOf(harness.pool, uid);
    await reconcile('2026-12-08T01:00:00Z');
    expect(await stateOf(harness.pool, uid)).toEqual(before);
    const { rows } = await harness.pool.query<{ value: { run_date: string; finished_at: string } }>(
      "SELECT value FROM ops.ops_config WHERE key = 'billing.reconcile_last_run'",
    );
    expect(rows[0]?.value).toMatchObject({ run_date: '2026-12-08' });
    expect(rows[0]?.value.finished_at).not.toBeNull();
  });

  it('follows the configured grace length', async () => {
    await harness.pool.query(
      `INSERT INTO ops.ops_config (key, value) VALUES ('billing.grace_days', '3')
       ON CONFLICT (key) DO UPDATE SET value = '3'`,
    );
    const uid = await inGrace();
    expect(await stateOf(harness.pool, uid)).toMatchObject({
      subscriptions: { pass_monthly: { status: 'grace', grace: '2026-12-04T00:10:00.000Z' } },
    });
    await harness.pool.query("DELETE FROM ops.ops_config WHERE key = 'billing.grace_days'");
  });
});
