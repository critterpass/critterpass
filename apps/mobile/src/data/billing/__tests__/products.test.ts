import { describe, expect, it } from '@jest/globals';

import { describeProducts, parsePeriod, storeProductIds } from '../products';

const product = (id: string, price: number, priceString: string, period: string | null) => ({
  id,
  title: id,
  price,
  priceString,
  currencyCode: 'USD',
  subscriptionPeriod: period,
});

describe('billing products', () => {
  it('shows the store price and works out the yearly saving and per-month price', () => {
    const ids = storeProductIds('app_store');
    const offers = describeProducts(
      [
        product('pass_monthly', 3.99, '$3.99', 'P1M'),
        product('pass_yearly', 29.99, '$29.99', 'P1Y'),
        product('boost_trip', 11.99, '$11.99', null),
      ],
      ids,
      'en-US',
    );
    expect(offers.pass_yearly).toMatchObject({
      priceString: '$29.99',
      period: { unit: 'year', count: 1 },
      perMonthString: '$2.50',
      savingsPercent: 37,
    });
    expect(offers.boost_trip).toMatchObject({ priceString: '$11.99', period: null });
    expect(offers.gift_pass_3m).toBeUndefined();
  });

  it('uses the synced store ids over the product keys', () => {
    const ids = storeProductIds('play', [
      { key: 'pass_monthly', storeIds: { play: 'pass:monthly', app_store: 'cp.pass.m' } },
    ]);
    expect(ids.pass_monthly).toBe('pass:monthly');
    expect(ids.boost_trip).toBe('boost_trip');
  });

  it('claims no saving when the currencies differ', () => {
    const offers = describeProducts(
      [
        product('pass_monthly', 3.99, '$3.99', 'P1M'),
        { ...product('pass_yearly', 700000, '₫700.000', 'P1Y'), currencyCode: 'VND' },
      ],
      storeProductIds('app_store'),
      'vi-VN',
    );
    expect(offers.pass_yearly?.savingsPercent).toBeNull();
  });

  it('reads ISO periods', () => {
    expect(parsePeriod('P3M')).toEqual({ unit: 'month', count: 3 });
    expect(parsePeriod(null)).toBeNull();
    expect(parsePeriod('nonsense')).toBeNull();
  });
});
