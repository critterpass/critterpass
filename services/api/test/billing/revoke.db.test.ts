/**
 * Refunds and revocations. A Pass+ refund reported by RevenueCat revokes the subscription and
 * takes Pass+ away; the refunded store transaction is stamped once, and `revoke_purchase` on it
 * again changes nothing.
 */
import { withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { revokePurchase } from '../../src/commands/billing/revoke-purchase';
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

describe('refunds', () => {
  it('revoke a refunded Pass+ subscription and its Pass+, once', async () => {
    const user = await harness.signIn();
    const steps = loadFixture('pass-refund', user.uid).steps;
    for (const step of steps) {
      harness.revenuecat.set(user.uid, step.subscriber);
      await apply(harness, await storeEvent(harness, step.webhook), new Date(step.now));
    }
    expect(await stateOf(harness.pool, user.uid)).toMatchObject({
      subscriptions: { pass_yearly: { status: 'revoked' } },
      passPlus: false,
    });
    const { rows } = await harness.pool.query<{ revoked_at: Date; revocation_reason: string }>(
      "SELECT revoked_at, revocation_reason FROM store_transactions WHERE transaction_id = '2000000300000001'",
    );
    expect(rows[0]?.revocation_reason).toBe('refund');
    const again = await withSystem(harness.pool, (tx) =>
      revokePurchase(
        tx,
        { platform: 'app_store', transaction_id: '2000000300000001', reason: 'refund' },
        new Date(),
      ),
    );
    expect(again).toEqual({ revoked: false, transaction_id: '2000000300000001' });
    const after = await harness.pool.query<{ revoked_at: Date }>(
      "SELECT revoked_at FROM store_transactions WHERE transaction_id = '2000000300000001'",
    );
    expect(after.rows[0]?.revoked_at).toEqual(rows[0]?.revoked_at);
  });
});
