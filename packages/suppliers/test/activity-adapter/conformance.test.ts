/**
 * The activity adapter conformance run: the Viator adapter passes it on Viator's published samples
 * (sandbox recordings replace them once access is approved), and an adapter whose capabilities
 * claim more than it implements is caught before its switch could turn on.
 */
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { runActivityConformance } from '../../src/activity-adapter/conformance';
import { capabilityMismatches, isActivityAdapter } from '../../src/activity-adapter/contract';
import { createSupplierHttp } from '../../src/core/http';
import { createViatorAdapter } from '../../src/viator/adapter';
import { VIATOR_SANDBOX_URL } from '../../src/viator/client';
import { recordedFetch } from '../helpers/recorded-fetch';

const FIXTURES = path.resolve(import.meta.dirname, '../viator/fixtures');

function viator() {
  const { fetch } = recordedFetch(FIXTURES, [
    { path: '/partner/products/search', file: 'products-search-affiliates.json' },
    { path: '/partner/bookings/cart/hold', file: 'cart-hold-viator-form.json' },
    { path: '/partner/bookings/cart/book', file: 'cart-book-viator-form.json' },
    { path: '/partner/bookings/status', file: 'booking-status-1.json' },
    { path: '/partner/bookings/BR-593038025/cancel-quote', file: 'cancel-quote.json' },
    { path: '/partner/bookings/BR-593038025/cancel', file: 'cancel.json' },
  ]);
  return createViatorAdapter({
    http: createSupplierHttp({ fetch, audit: () => Promise.resolve() }),
    config: { apiKey: 'k', baseUrl: VIATOR_SANDBOX_URL, hostingUrl: 'https://pay.test' },
  });
}

describe('activity adapter conformance', () => {
  it('passes the Viator adapter on its published samples', async () => {
    const adapter = viator();
    expect(isActivityAdapter(adapter)).toBe(true);
    const findings = await runActivityConformance(adapter, {
      query: { destinationRef: '739', date: '2026-10-13', currency: 'AUD' },
      hold: {
        cartRef: 'lW83mqyU',
        currency: 'AUD',
        items: [
          {
            itemRef: 'irk5vCJ7',
            productCode: '5010SYDNEY',
            travelDate: '2026-10-13',
            pax: [{ ageBand: 'ADULT', count: 2 }],
          },
        ],
      },
      book: {
        paymentToken: 'form-token',
        booker: { firstName: 'Ana', lastName: 'Lee' },
        communication: { phone: '+6591234567' },
        items: [{ bookingRef: 'BR-593038025', answers: [] }],
      },
      cancelReason: 'Customer_Service.I_canceled_my_entire_trip',
    });
    expect(findings).toEqual([]);
  });

  it('catches an adapter that claims a capability it does not implement', () => {
    const adapter = viator();
    const { hold: _hold, ...withoutHold } = adapter;
    expect(capabilityMismatches(withoutHold)).toEqual(['hold']);
  });
});
