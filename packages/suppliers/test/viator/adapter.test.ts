/**
 * The Viator adapter on Viator's published Partner API v2 samples (sandbox recordings replace them
 * once our access is approved): request shapes (key header, API version, the hosted payment form,
 * the 16-item cart cap), hold truth (seats held only when availability is `HOLDING`), booking,
 * status, modified-since, cancel quote and cancel; and the rolling 10-second limiter never lets an
 * endpoint exceed its allowance.
 */
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { createSupplierHttp } from '../../src/core/http';
import { createViatorAdapter, VIATOR_MAX_CART_ITEMS } from '../../src/viator/adapter';
import { VIATOR_SANDBOX_URL } from '../../src/viator/client';
import { createRollingLimiter } from '../../src/viator/rate-limit';
import { recordedFetch, type RecordedRoute } from '../helpers/recorded-fetch';

const FIXTURES = path.resolve(import.meta.dirname, 'fixtures');
const BASE = '/partner';

function adapterWith(routes: readonly RecordedRoute[]) {
  const recorded = recordedFetch(FIXTURES, routes);
  const http = createSupplierHttp({ fetch: recorded.fetch, audit: () => Promise.resolve() });
  const adapter = createViatorAdapter({
    http,
    config: { apiKey: 'sandbox-key', baseUrl: VIATOR_SANDBOX_URL, hostingUrl: 'https://pay.test' },
    now: () => new Date('2026-09-30T04:00:00Z'),
  });
  return { adapter, requests: recorded.requests };
}

const HOLD = {
  cartRef: 'lW83mqyU',
  currency: 'AUD',
  items: [
    {
      itemRef: 'irk5vCJ7',
      productCode: '5010SYDNEY',
      optionCode: 'TG1',
      travelDate: '2026-10-13',
      startTime: '09:00',
      pax: [{ ageBand: 'ADULT' as const, count: 2 }],
    },
  ],
};

describe('Viator requests', () => {
  it('holds a cart for the hosted payment form with our key and API version', async () => {
    const { adapter, requests } = adapterWith([
      { path: `${BASE}/bookings/cart/hold`, file: 'cart-hold-viator-form.json' },
    ]);
    await adapter.hold(HOLD);
    const sent = requests[0]!;
    expect(sent.url.origin).toBe('https://api.sandbox.viator.com');
    expect(sent.headers.get('exp-api-key')).toBe('sandbox-key');
    expect(sent.headers.get('Accept')).toBe('application/json;version=2.0');
    expect(JSON.parse(sent.body!)).toEqual({
      partnerCartRef: 'lW83mqyU',
      currency: 'AUD',
      items: [
        {
          partnerBookingRef: 'irk5vCJ7',
          productCode: '5010SYDNEY',
          productOptionCode: 'TG1',
          startTime: '09:00',
          travelDate: '2026-10-13',
          paxMix: [{ ageBand: 'ADULT', numberOfTravelers: 2 }],
        },
      ],
      paymentDataSubmissionMode: 'VIATOR_FORM',
      hostingUrl: 'https://pay.test',
    });
  });

  it('refuses a cart over the 16-item cap without calling Viator', async () => {
    const { adapter, requests } = adapterWith([]);
    const items = Array.from({ length: VIATOR_MAX_CART_ITEMS + 1 }, (_, i) => ({
      ...HOLD.items[0]!,
      itemRef: `item-${i}`,
    }));
    await expect(adapter.hold({ ...HOLD, items })).rejects.toBeInstanceOf(RangeError);
    expect(requests).toHaveLength(0);
  });
});

describe('Viator hold truth', () => {
  it('holds the price but not the seats when availability is not provided', async () => {
    const { adapter } = adapterWith([
      { path: `${BASE}/bookings/cart/hold`, file: 'cart-hold-viator-form.json' },
    ]);
    const hold = await adapter.hold(HOLD);
    expect(hold).toMatchObject({
      holdRef: 'CR-cb9c9d63017a63c96454e4a5b0b153eb',
      holdProvided: false,
      priceHeldUntil: '2023-07-21T03:17:37.494535Z',
      total: { amount: 12.52, currency: 'AUD' },
    });
    expect(hold.seatsHeldUntil).toBeUndefined();
    expect(hold.paymentSessionToken).toBe('sample-payment-session-token');
  });
});

describe('Viator booking lifecycle', () => {
  it('books with the payment token and brings back the voucher', async () => {
    const { adapter, requests } = adapterWith([
      { path: `${BASE}/bookings/cart/book`, file: 'cart-book-viator-form.json' },
    ]);
    const result = await adapter.book({
      holdRef: 'CR-cb9c9d63017a63c96454e4a5b0b153eb',
      paymentToken: 'form-token',
      booker: { firstName: 'Maya', lastName: 'Tan' },
      communication: { phone: '+6591234567' },
      items: [{ bookingRef: 'BR-593038025', answers: [] }],
    });
    expect(result.status).toBe('confirmed');
    expect(result.voucher?.url).toMatch(/^https:\/\/shop\.live\.rc\.viator\.com\/ticket/);
    expect(JSON.parse(requests[0]!.body!)).toMatchObject({
      cartRef: 'CR-cb9c9d63017a63c96454e4a5b0b153eb',
      paymentToken: 'form-token',
      items: [{ bookingRef: 'BR-593038025' }],
    });
  });

  it.each([
    ['booking-status-1.json', 'confirmed'],
    ['booking-status-2.json', 'pending'],
    ['booking-status-3.json', 'cancelled'],
  ])('reads %s as %s', async (file, status) => {
    const { adapter } = adapterWith([{ path: `${BASE}/bookings/status`, file }]);
    expect((await adapter.status('BR-1')).status).toBe(status);
  });

  it('keeps Viator’s next poll hint for a pending booking', async () => {
    const { adapter } = adapterWith([
      { path: `${BASE}/bookings/status`, file: 'booking-status-2.json' },
    ]);
    expect((await adapter.status('BR-784007177')).nextPollAt).toBe('2025-07-22T11:24:05.764088Z');
  });

  it('reads supplier cancellations since a time and pages on', async () => {
    const { adapter, requests } = adapterWith([
      { path: `${BASE}/bookings/modified-since`, file: 'modified-since.json' },
    ]);
    const page = await adapter.pollModifiedSince('2026-09-30T00:00:00Z');
    expect(requests[0]!.url.searchParams.get('modified-since')).toBe('2026-09-30T00:00:00Z');
    expect(page.changes.map((change) => [change.bookingRef, change.status])).toEqual([
      ['BR-204104077', 'cancelled'],
      ['BR-204104078', 'cancelled'],
    ]);
    expect(page.next).toBe('MTYxMjc2OTM4NXwxNTU5MTlQMXxJTkFDVElWRQ==');
  });

  it('quotes the refund before cancelling, then cancels', async () => {
    const { adapter } = adapterWith([
      { path: `${BASE}/bookings/BR-581567752/cancel-quote`, file: 'cancel-quote.json' },
      { path: `${BASE}/bookings/BR-581567752/cancel`, file: 'cancel.json' },
    ]);
    expect(await adapter.cancelQuote('BR-581567752')).toEqual({
      cancellable: true,
      refund: { amount: 60.2, currency: 'AUD' },
      refundPercentage: 100,
    });
    expect(
      await adapter.cancel('BR-581567752', 'Customer_Service.I_canceled_my_entire_trip'),
    ).toEqual({ status: 'cancelled', reason: null });
  });

  it('shows search offers with a from price and never claims a hold', async () => {
    const { adapter } = adapterWith([
      { path: `${BASE}/products/search`, file: 'products-search-affiliates.json' },
    ]);
    const offers = await adapter.search({
      destinationRef: '739',
      date: '2026-10-13',
      currency: 'USD',
    });
    expect(offers[0]).toMatchObject({
      supplier: 'viator',
      productCode: '62330P2',
      priceFrom: { amount: 402.32, currency: 'USD' },
      holdSupported: false,
      seenAt: '2026-09-30T04:00:00.000Z',
    });
  });
});

describe('Viator rate limiter', () => {
  it('never lets an endpoint exceed its allowance in any 10-second window', async () => {
    let clock = 0;
    const admitted: number[] = [];
    const limiter = createRollingLimiter({
      allowances: { cart_hold: 3 },
      now: () => clock,
      sleep: (ms) => {
        clock += ms;
        return Promise.resolve();
      },
    });
    await Promise.all(
      Array.from({ length: 10 }, () =>
        limiter.acquire('cart_hold').then(() => admitted.push(clock)),
      ),
    );
    expect(admitted).toHaveLength(10);
    for (const at of admitted) {
      expect(admitted.filter((t) => t > at - 10_000 && t <= at).length).toBeLessThanOrEqual(3);
    }
    // Endpoints are limited independently.
    await limiter.acquire('booking_status');
    expect(limiter.inWindow('booking_status')).toBe(1);
  });
});
