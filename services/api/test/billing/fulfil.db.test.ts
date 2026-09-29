/**
 * Store purchases reach entitlements. Recorded RevenueCat events replay through the webhook and
 * `billing.apply` to the expected subscription state and Pass+ (a purchase, a renewal, a cancel
 * and an uncancel, an upgrade, a Play pause); applying any event again changes nothing. The app's
 * own purchase report grants only what RevenueCat confirms, once, for the account that bought it.
 */
import { generateUuidV7 } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { errorOf, resultOf, type SignedIn } from '../setup/setup-harness';
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

async function replayScenario(name: string): Promise<SignedIn> {
  const user = await harness.signIn();
  const { steps } = loadFixture(name, user.uid);
  for (const step of steps) {
    harness.revenuecat.set(user.uid, step.subscriber);
    const eventId = await storeEvent(harness, step.webhook);
    expect(await apply(harness, eventId, new Date(step.now)), step.webhook.event.id).toBe(
      'applied',
    );
    const state = await stateOf(harness.pool, user.uid);
    expect(state.subscriptions[step.expect.product], step.webhook.event.id).toMatchObject({
      status: step.expect.status,
      platform: step.expect.platform ?? 'app_store',
      ...(step.expect.grace_ends_at === undefined ? {} : { grace: step.expect.grace_ends_at }),
    });
    for (const [product, status] of Object.entries(step.expect.also ?? {})) {
      expect(state.subscriptions[product]?.status).toBe(status);
    }
    expect(state.passPlus, step.webhook.event.id).toBe(step.expect.pass_plus);
    expect(state.transactions, step.webhook.event.id).toBe(step.expect.transactions);

    // Every event again: as a redelivery, and as a deliberate replay. Nothing moves.
    const before = await stateOf(harness.pool, user.uid);
    expect(await apply(harness, eventId, new Date(step.now))).toBe('duplicate');
    expect(await apply(harness, eventId, new Date(step.now), true)).toBe('applied');
    expect(await stateOf(harness.pool, user.uid)).toEqual(before);
  }
  return user;
}

describe('recorded RevenueCat events', () => {
  it('follow a monthly Pass+ through purchase, renewal, cancel and uncancel', async () => {
    await replayScenario('pass-app-store-lifecycle');
  });

  it('move a monthly subscriber to yearly without losing Pass+', async () => {
    await replayScenario('pass-product-change');
  });

  it('pause a Play subscription once its period ends', async () => {
    await replayScenario('pass-play-pause');
  });
});

describe('fulfil_purchase from the app', () => {
  const purchase = (transactionId: string) => ({
    source: 'client_sync',
    platform: 'app_store',
    transaction_id: transactionId,
    store_product_id: 'pass_monthly',
  });
  const customer = (uid: string, transactionId: string) => ({
    subscriber: {
      original_app_user_id: uid,
      subscriptions: {
        pass_monthly: {
          purchase_date: new Date().toISOString(),
          expires_date: new Date(Date.now() + 30 * 86_400_000).toISOString(),
          store: 'app_store',
          is_sandbox: true,
          store_transaction_id: transactionId,
        },
      },
      non_subscriptions: {},
    },
  });

  it('grants Pass+ once RevenueCat confirms the purchase, and only once', async () => {
    const user = await harness.signIn();
    const txn = `2000000900${Date.now()}`;
    harness.revenuecat.set(user.uid, customer(user.uid, txn));
    const first = await harness.run(user, 'fulfil_purchase', purchase(txn));
    expect(resultOf(first)).toMatchObject({
      status: 'fulfilled',
      product_key: 'pass_monthly',
      pass_plus: true,
    });
    const again = await harness.run(user, 'fulfil_purchase', purchase(txn));
    expect(resultOf(again)).toMatchObject({ pass_plus: true });
    expect((await stateOf(harness.pool, user.uid)).transactions).toBe(1);
  });

  it('refuses a transaction RevenueCat does not list for this account', async () => {
    const user = await harness.signIn();
    harness.revenuecat.set(user.uid, customer(user.uid, 'someone-elses'));
    const response = await harness.run(user, 'fulfil_purchase', purchase('2000000999999999'));
    expect(errorOf(response)).toMatchObject({
      code: 'STATE_INVALID',
      detail: { reason: 'transaction_unverified' },
    });
    expect((await stateOf(harness.pool, user.uid)).passPlus).toBe(false);
  });

  it('never binds a purchase another Critterpass account already owns', async () => {
    const owner = await harness.signIn();
    const other = await harness.signIn();
    const txn = `2000000800${Date.now()}`;
    harness.revenuecat.set(owner.uid, customer(owner.uid, txn));
    harness.revenuecat.set(other.uid, customer(other.uid, txn));
    await harness.run(owner, 'fulfil_purchase', purchase(txn));
    const response = await harness.run(other, 'fulfil_purchase', purchase(txn));
    expect(errorOf(response).code).toBe('OWNED_BY_OTHER_ACCOUNT');
  });

  it('answers switched_off while purchases are switched off', async () => {
    const user = await harness.signIn();
    await harness.pool.query(
      `INSERT INTO ops.ops_config (key, value) VALUES ('billing.enabled', 'false')
       ON CONFLICT (key) DO UPDATE SET value = 'false'`,
    );
    await new Promise((resolve) => setTimeout(resolve, 5_100));
    const response = await harness.run(user, 'fulfil_purchase', purchase(generateUuidV7()));
    expect(errorOf(response)).toMatchObject({
      code: 'STATE_INVALID',
      detail: { reason: 'switched_off', key: 'billing.enabled' },
    });
    await harness.pool.query("DELETE FROM ops.ops_config WHERE key = 'billing.enabled'");
  });
});
