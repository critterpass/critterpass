import { describe, expect, it } from '@jest/globals';

import {
  IDLE,
  isPurchaseBusy,
  purchaseTransition,
  runPurchase,
  type PurchaseEvent,
  type PurchaseFlowDeps,
  type PurchaseState,
} from '../purchase-machine';

const fulfilled = {
  status: 'fulfilled' as const,
  product_key: 'pass_yearly',
  pass_plus: true,
  boost_id: null,
};

function run(events: PurchaseEvent[], from: PurchaseState = IDLE): PurchaseState {
  return events.reduce(purchaseTransition, from);
}

const start: PurchaseEvent = { type: 'start', productKey: 'pass_yearly' };

describe('purchase machine', () => {
  it('goes idle → purchasing → verifying → done on a confirmed purchase', () => {
    const states: string[] = [];
    let state = IDLE;
    for (const event of [
      start,
      { type: 'store_success', transactionId: 't1' },
      { type: 'verified', result: fulfilled },
    ] as PurchaseEvent[]) {
      state = purchaseTransition(state, event);
      states.push(state.status);
    }
    expect(states).toEqual(['purchasing', 'verifying', 'done']);
    expect(state).toMatchObject({ passPlus: true, boostId: null });
  });

  it('keeps a pending purchase until the store listener sees it land', () => {
    const pending = run([start, { type: 'store_pending' }]);
    expect(pending.status).toBe('pending');
    expect(purchaseTransition(pending, { type: 'verify_timeout' })).toBe(pending);
    const later = run(
      [
        { type: 'listener_success', transactionId: 't2' },
        { type: 'verified', result: fulfilled },
      ],
      pending,
    );
    expect(later.status).toBe('done');
  });

  it('moves a slow verification to background, then done on entitlement.changed', () => {
    const background = run([
      start,
      { type: 'store_success', transactionId: 't' },
      { type: 'verify_timeout' },
    ]);
    expect(background.status).toBe('background');
    expect(purchaseTransition(background, { type: 'verify_failed', code: 'NETWORK' })).toBe(
      background,
    );
    expect(purchaseTransition(background, { type: 'entitlement_changed' })).toMatchObject({
      status: 'done',
      passPlus: true,
    });
  });

  it('a boost confirmed by entitlement.changed does not claim Pass+', () => {
    const boost = run([
      { type: 'start', productKey: 'boost_trip' },
      { type: 'store_success', transactionId: 't' },
      { type: 'entitlement_changed' },
    ]);
    expect(boost).toMatchObject({ status: 'done', passPlus: false });
  });

  it('never charges again after a failed verification: only the verification retries', () => {
    const failed = run([
      start,
      { type: 'store_success', transactionId: 't9' },
      { type: 'verify_failed', code: 'NETWORK' },
    ]);
    expect(failed).toMatchObject({ status: 'failed', stage: 'verify', transactionId: 't9' });
    expect(purchaseTransition(failed, start)).toBe(failed);
    expect(purchaseTransition(failed, { type: 'retry_verify' })).toMatchObject({
      status: 'verifying',
      transactionId: 't9',
    });
  });

  it('lets the user try again after a cancelled or refused charge', () => {
    expect(run([start, { type: 'store_cancelled' }, start]).status).toBe('purchasing');
    expect(run([start, { type: 'store_failed', code: '2' }, start]).status).toBe('purchasing');
  });

  it('ignores reset while the store or server is working', () => {
    const purchasing = run([start]);
    expect(isPurchaseBusy(purchasing)).toBe(true);
    expect(purchaseTransition(purchasing, { type: 'reset' })).toBe(purchasing);
    expect(purchaseTransition(run([start, { type: 'store_cancelled' }]), { type: 'reset' })).toBe(
      IDLE,
    );
  });

  it('a pending server answer leaves the purchase finishing in the background', () => {
    const verifying = run([start, { type: 'store_success', transactionId: 't' }]);
    expect(
      purchaseTransition(verifying, {
        type: 'verified',
        result: { ...fulfilled, status: 'pending' },
      }).status,
    ).toBe('background');
  });
});

describe('runPurchase', () => {
  function deps(overrides: Partial<PurchaseFlowDeps>): PurchaseFlowDeps {
    return {
      platform: 'app_store',
      purchase: () =>
        Promise.resolve({ kind: 'success', transactionId: 't1', productId: 'pass_yearly' }),
      fulfil: () => Promise.resolve(fulfilled),
      sleep: () => new Promise(() => undefined),
      ...overrides,
    };
  }

  it('syncs the store transaction to the API and reports each state', async () => {
    const seen: string[] = [];
    const payloads: unknown[] = [];
    const final = await runPurchase(
      deps({
        fulfil: (payload) => {
          payloads.push(payload);
          return Promise.resolve(fulfilled);
        },
      }),
      {
        productKey: 'pass_yearly',
        storeProductId: 'pass_yearly',
        intentId: '0190b0d4-0000-7000-8000-000000000001',
      },
      (state) => seen.push(state.status),
    );
    expect(final.status).toBe('done');
    expect(seen).toEqual(['purchasing', 'verifying', 'done']);
    expect(payloads).toEqual([
      {
        source: 'client_sync',
        platform: 'app_store',
        transaction_id: 't1',
        store_product_id: 'pass_yearly',
        intent_id: '0190b0d4-0000-7000-8000-000000000001',
      },
    ]);
  });

  it('stops waiting after the budget and finishes when the answer lands', async () => {
    let answer: (value: typeof fulfilled) => void = () => undefined;
    const seen: string[] = [];
    const final = await runPurchase(
      deps({
        fulfil: () => new Promise((resolve) => (answer = resolve)),
        sleep: () => Promise.resolve(),
      }),
      { productKey: 'pass_yearly', storeProductId: 'pass_yearly' },
      (state) => seen.push(state.status),
    );
    expect(final.status).toBe('background');
    answer(fulfilled);
    await Promise.resolve();
    await Promise.resolve();
    expect(seen.at(-1)).toBe('done');
  });

  it('does not call the API when the store did not charge', async () => {
    let called = false;
    const final = await runPurchase(
      deps({
        purchase: () => Promise.resolve({ kind: 'cancelled' }),
        fulfil: () => {
          called = true;
          return Promise.resolve(fulfilled);
        },
      }),
      { productKey: 'pass_monthly', storeProductId: 'pass_monthly' },
      () => undefined,
    );
    expect(final.status).toBe('cancelled');
    expect(called).toBe(false);
  });
});
