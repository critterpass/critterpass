/**
 * The boost sheet's button buys only when the trip can take a boost, nobody else holds its lock
 * and the store has a price; the split preview follows the server's rule (equal floored shares,
 * the buyer absorbs the remainder).
 */
import { describe, expect, it } from '@jest/globals';

import type { ProductOffer, ProductsState } from '@/data/billing';

import { boostModel, boostWindowEnd, sharePreview, type BoostInput } from '../boost-model';

const offer = (key: ProductOffer['key'], price: number, currencyCode = 'USD'): ProductOffer => ({
  key,
  storeProductId: key,
  priceString: `${currencyCode} ${price}`,
  price,
  currencyCode,
  period: null,
  perMonthString: null,
  savingsPercent: null,
});

const READY: ProductsState = {
  status: 'ready',
  offers: {
    boost_trip: offer('boost_trip', 11.99),
    boost_crew_year: offer('boost_crew_year', 59.99),
  },
};

const SEATED = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((uid) => ({ uid, name: uid.toUpperCase() }));
const NOW = new Date('2026-11-02T12:00:00Z');

const model = (over: Partial<BoostInput>) =>
  boostModel({
    products: READY,
    purchase: { status: 'idle' },
    online: true,
    option: 'trip',
    whoPays: 'cover',
    trip: { status: 'planning', boostActive: false, endDate: '2027-04-09', solo: false },
    seated: SEATED,
    buyerUid: 'a',
    lock: null,
    intentError: null,
    now: NOW,
    locale: 'en-US',
    ...over,
  });

describe('boostModel', () => {
  it('covers by default: nobody else is named', () => {
    const cover = model({});
    expect(cover).toMatchObject({
      phase: 'ready',
      canBuy: true,
      whoPays: 'cover',
      eachShare: null,
    });
    expect(cover.memberUids).toEqual([]);
    expect(cover.productKey).toBe('boost_trip');
  });

  it('splits over everyone seated, the buyer included, with floored equal shares', () => {
    const split = model({ whoPays: 'split' });
    expect(split.memberUids).toHaveLength(7);
    expect(split.memberUids[0]).toBe('a');
    // 1199 / 7 = 171.28…: each owes 1.71 and the buyer keeps the remainder.
    expect(split.eachShare).toBe('$1.71');
    expect(split.eachShareExact).toBe(false);
  });

  it('shows a share of whole units without decimals, exact when the price divides evenly', () => {
    const even = model({
      whoPays: 'split',
      seated: SEATED.slice(0, 6),
      products: { status: 'ready', offers: { boost_trip: offer('boost_trip', 12) } },
    });
    expect(even.eachShare).toBe('$2');
    expect(even.eachShareExact).toBe(true);
    // 1405 / 7 = 200.71…: each owes a whole 2 and the buyer keeps the remainder.
    const floored = model({
      whoPays: 'split',
      products: { status: 'ready', offers: { boost_trip: offer('boost_trip', 14.05) } },
    });
    expect(floored.eachShare).toBe('$2');
    expect(floored.eachShareExact).toBe(false);
  });

  it('has nothing to split on a trip for one, and no yearly crew boost', () => {
    const solo = model({
      whoPays: 'split',
      option: 'year',
      seated: [{ uid: 'a', name: 'A' }],
      trip: { status: 'planning', boostActive: false, endDate: '2027-04-09', solo: true },
    });
    expect(solo).toMatchObject({ canSplit: false, whoPays: 'cover', option: 'trip', canBuy: true });
    expect(solo.yearOffer).toBeNull();
  });

  it('the yearly option buys the crew yearly product', () => {
    expect(model({ option: 'year' })).toMatchObject({
      option: 'year',
      productKey: 'boost_crew_year',
    });
  });

  it('is on until a week after the trip ends', () => {
    expect(model({}).windowEnd).toBe('2027-04-16');
    expect(boostWindowEnd(null)).toBeNull();
  });

  it('does not sell a boost for a trip that has one, is over, or is past its window', () => {
    expect(
      model({
        trip: { status: 'planning', boostActive: true, endDate: '2027-04-09', solo: false },
      }),
    ).toMatchObject({ phase: 'boosted', canBuy: false });
    expect(
      model({ trip: { status: 'cancelled', boostActive: false, endDate: null, solo: false } }),
    ).toMatchObject({ phase: 'ended', canBuy: false });
    expect(
      model({
        trip: { status: 'on_trip', boostActive: false, endDate: '2026-10-20', solo: false },
      }),
    ).toMatchObject({ phase: 'ended', canBuy: false });
  });

  it('waits while a crewmate holds the lock, and ignores a lapsed or own lock', () => {
    const held = { buyerUid: 'b', name: 'Maya', expiresAt: '2026-11-02T12:10:00Z' };
    expect(model({ lock: held })).toMatchObject({
      phase: 'locked',
      lockedBy: 'Maya',
      canBuy: false,
    });
    expect(model({ lock: { ...held, expiresAt: '2026-11-02T11:59:00Z' } }).phase).toBe('ready');
    expect(model({ lock: { ...held, buyerUid: 'a' } }).phase).toBe('ready');
    // The server said so before the lock row synced.
    expect(model({ intentError: 'locked' })).toMatchObject({ phase: 'locked', canBuy: false });
  });

  it('cannot buy without a price, offline, or before the trip is read', () => {
    expect(model({ products: { status: 'unavailable' } })).toMatchObject({
      phase: 'unavailable',
      canBuy: false,
    });
    expect(model({ online: false })).toMatchObject({ phase: 'offline', canBuy: false });
    expect(model({ trip: null })).toMatchObject({ phase: 'loading', canBuy: false });
    expect(model({ buyerUid: null }).canBuy).toBe(false);
  });

  it('a refused start or a refused payment can be tried again; a charged one cannot', () => {
    expect(model({ intentError: 'refused' })).toMatchObject({ phase: 'refused', canBuy: true });
    expect(
      model({
        purchase: { status: 'failed', productKey: 'boost_trip', stage: 'store', code: 'x' },
      }),
    ).toMatchObject({ phase: 'failed', canBuy: true });
    expect(
      model({
        purchase: {
          status: 'failed',
          productKey: 'boost_trip',
          stage: 'verify',
          code: 'NETWORK',
          transactionId: 't',
        },
      }),
    ).toMatchObject({ phase: 'verify_failed', canBuy: false });
    expect(
      model({ purchase: { status: 'verifying', productKey: 'boost_trip', transactionId: 't' } }),
    ).toMatchObject({ phase: 'verifying', canBuy: false });
  });

  it('is done only when the purchase machine says the server confirmed', () => {
    expect(
      model({
        purchase: { status: 'done', productKey: 'boost_trip', passPlus: false, boostId: 'b' },
      }).phase,
    ).toBe('done');
    expect(
      model({ purchase: { status: 'background', productKey: 'boost_trip', transactionId: 't' } })
        .phase,
    ).toBe('background');
  });
});

describe('sharePreview', () => {
  it('uses the currency of the store price, whole units for a currency without cents', () => {
    const yen = offer('boost_trip', 1800, 'JPY');
    expect(sharePreview(yen, 'a', ['a', 'b', 'c', 'd', 'e', 'f', 'g'], 'en-US')?.text).toBe('¥257');
  });

  it('has no share to show when the buyer is alone or not among the members', () => {
    const usd = offer('boost_trip', 11.99);
    expect(sharePreview(usd, 'a', ['a'], 'en-US')).toBeNull();
    expect(sharePreview(usd, 'a', ['b', 'c'], 'en-US')).toBeNull();
  });
});
