/**
 * The paywall's button may only buy when the store has a price for the plan and nothing else is in
 * flight; every other state the store or the server can leave a purchase in has its own phase.
 */
import { describe, expect, it } from '@jest/globals';

import type { ProductOffer, ProductsState, PurchaseState } from '@/data/billing';

import { paywallModel, type PaywallInput } from '../paywall-model';

const offer = (key: ProductOffer['key'], price: number): ProductOffer => ({
  key,
  storeProductId: key,
  priceString: `EUR ${price}`,
  price,
  currencyCode: 'EUR',
  period: null,
  perMonthString: null,
  savingsPercent: null,
});

const READY: ProductsState = {
  status: 'ready',
  offers: { pass_monthly: offer('pass_monthly', 4), pass_yearly: offer('pass_yearly', 30) },
};

const model = (over: Partial<PaywallInput>) =>
  paywallModel({
    products: READY,
    purchase: { status: 'idle' },
    period: 'yearly',
    passPlus: false,
    online: true,
    ...over,
  });

describe('paywallModel', () => {
  it('is ready to buy the chosen plan when the store has its price', () => {
    const yearly = model({});
    expect(yearly.phase).toBe('ready');
    expect(yearly.canBuy).toBe(true);
    expect(yearly.offer?.key).toBe('pass_yearly');
    expect(model({ period: 'monthly' }).offer?.key).toBe('pass_monthly');
  });

  it('cannot buy without a store, without products, or while prices load', () => {
    for (const products of [{ status: 'unavailable' }, { status: 'ready', offers: {} }] as const) {
      const none = model({ products });
      expect(none.phase).toBe('unavailable');
      expect(none.canBuy).toBe(false);
      expect(none.offer).toBeNull();
    }
    const loading = model({ products: { status: 'loading' } });
    expect(loading.phase).toBe('loading');
    expect(loading.canBuy).toBe(false);
  });

  it('falls back to the plan the store does have', () => {
    const onlyMonthly = model({
      products: { status: 'ready', offers: { pass_monthly: offer('pass_monthly', 4) } },
    });
    expect(onlyMonthly.period).toBe('monthly');
    expect(onlyMonthly.offer?.key).toBe('pass_monthly');
    expect(onlyMonthly.canBuy).toBe(true);
  });

  it('cannot buy offline', () => {
    const offline = model({ online: false });
    expect(offline.phase).toBe('offline');
    expect(offline.canBuy).toBe(false);
  });

  it('says offline, not "purchases are not available", when the store had no signal to answer', () => {
    expect(model({ online: false, products: { status: 'unavailable' } }).phase).toBe('offline');
    expect(model({ online: false, products: { status: 'loading' } }).phase).toBe('offline');
    expect(model({ online: true, products: { status: 'unavailable' } }).phase).toBe('unavailable');
  });

  it('never starts a second purchase while one is in flight or waiting', () => {
    const states: PurchaseState[] = [
      { status: 'purchasing', productKey: 'pass_yearly' },
      { status: 'verifying', productKey: 'pass_yearly', transactionId: 't' },
      { status: 'pending', productKey: 'pass_yearly' },
      { status: 'background', productKey: 'pass_yearly', transactionId: 't' },
    ];
    for (const purchase of states) {
      const busy = model({ purchase });
      expect(busy.phase).toBe(purchase.status);
      expect(busy.canBuy).toBe(false);
    }
  });

  it('lets a payment the store refused be tried again, but never one that was charged', () => {
    const refused = model({
      purchase: { status: 'failed', productKey: 'pass_yearly', stage: 'store', code: 'x' },
    });
    expect(refused.phase).toBe('failed');
    expect(refused.canBuy).toBe(true);
    const charged = model({
      purchase: {
        status: 'failed',
        productKey: 'pass_yearly',
        stage: 'verify',
        code: 'NETWORK',
        transactionId: 't',
      },
    });
    expect(charged.phase).toBe('verify_failed');
    expect(charged.canBuy).toBe(false);
  });

  it('a cancelled store sheet goes back to ready, silently', () => {
    expect(model({ purchase: { status: 'cancelled', productKey: 'pass_yearly' } }).phase).toBe(
      'ready',
    );
  });

  it('offers nothing to someone who already has Pass+', () => {
    const has = model({ passPlus: true });
    expect(has.phase).toBe('subscribed');
    expect(has.canBuy).toBe(false);
    // A store with no products does not hide what the person already has.
    expect(model({ passPlus: true, products: { status: 'unavailable' } }).phase).toBe('subscribed');
  });

  it('a purchase the server confirmed reads as subscribed before the row syncs', () => {
    const done = model({
      purchase: { status: 'done', productKey: 'pass_yearly', passPlus: true, boostId: null },
    });
    expect(done.phase).toBe('subscribed');
  });
});
