import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { SupplierCallRecord } from '../../src/core/audit';
import { createSupplierHttp } from '../../src/core/http';
import { fetchFareMonth } from '../../src/travelpayouts/fares/client';
import { foundAtFromLink, mapFareMonth } from '../../src/travelpayouts/fares/map';
import { recordedFetch } from '../helpers/recorded-fetch';

const FIXTURES = path.join(import.meta.dirname, 'fixtures');
const ROUTES = [
  {
    path: '/aviasales/v3/prices_for_dates',
    params: { origin: 'SIN', destination: 'DPS', departure_at: '2026-11' },
    file: 'prices-for-dates-sin-dps-2026-11.json',
  },
  {
    path: '/aviasales/v3/prices_for_dates',
    params: { origin: 'SIN', destination: 'KIX', departure_at: '2027-04' },
    file: 'prices-for-dates-sin-kix-2027-04.json',
  },
  {
    path: '/aviasales/v3/prices_for_dates',
    params: { origin: 'HAN', destination: 'CUZ', departure_at: '2027-02' },
    file: 'prices-for-dates-han-cuz-2027-02.json',
  },
];

function harness() {
  const recorded = recordedFetch(FIXTURES, ROUTES);
  const audits: SupplierCallRecord[] = [];
  const http = createSupplierHttp({
    fetch: recorded.fetch,
    audit: (record) => {
      audits.push(record);
      return Promise.resolve();
    },
  });
  return { http, audits, requests: recorded.requests };
}

const CONFIG = { token: 'test-token' };

describe('Travelpayouts prices_for_dates client', () => {
  it('sends the token as a header, never in the URL, and asks for USD round trips in the month', async () => {
    const { http, requests } = harness();
    await fetchFareMonth(http, CONFIG, { origin: 'SIN', destination: 'DPS', month: '2026-11' });
    const request = requests[0]!;
    expect(request.headers.get('x-access-token')).toBe('test-token');
    expect(request.url.toString()).not.toContain('test-token');
    expect(Object.fromEntries(request.url.searchParams)).toMatchObject({
      departure_at: '2026-11',
      return_at: '2026-11',
      one_way: 'false',
      currency: 'usd',
    });
  });

  it('audits the call under a fixed endpoint label', async () => {
    const { http, audits } = harness();
    await fetchFareMonth(http, CONFIG, { origin: 'SIN', destination: 'KIX', month: '2027-04' });
    expect(audits).toEqual([
      expect.objectContaining({
        supplier: 'travelpayouts',
        endpoint: 'prices_for_dates',
        method: 'GET',
        attempt: 1,
        outcome: 'ok',
        status: 200,
      }),
    ]);
  });
});

describe('mapFareMonth', () => {
  it('summarises a recorded month: cheapest trip, fastest short-haul outbound, cheapest per day', async () => {
    const { http } = harness();
    const month = await fetchFareMonth(http, CONFIG, {
      origin: 'SIN',
      destination: 'DPS',
      month: '2026-11',
    });
    const summary = mapFareMonth(month.prices, month.currency);
    expect(summary).toMatchObject({
      currency: 'USD',
      priceMinor: 13_900,
      departOn: '2026-11-11',
      returnOn: '2026-11-19',
      transfers: 0,
      durationMin: 175,
      fastestDurationMin: 165,
      foundAt: '2026-09-26T00:00:00.000Z',
    });
    const days = summary!.days;
    expect(days.map((day) => day.depart_on)).toEqual([...days.map((d) => d.depart_on)].sort());
    expect(new Set(days.map((day) => day.depart_on)).size).toBe(days.length);
    expect(days.find((day) => day.depart_on === '2026-11-01')).toEqual({
      depart_on: '2026-11-01',
      return_on: '2026-11-13',
      price_minor: 17_200,
      transfers: 0,
    });
  });

  it('keeps a one-stop trip in the fastest-duration chip', async () => {
    const { http } = harness();
    const month = await fetchFareMonth(http, CONFIG, {
      origin: 'SIN',
      destination: 'KIX',
      month: '2027-04',
    });
    const summary = mapFareMonth(month.prices, month.currency);
    expect(summary?.transfers).toBeGreaterThanOrEqual(1);
    expect(summary?.fastestDurationMin).not.toBeNull();
  });

  it('maps an empty month to null, never to a zero price', async () => {
    const { http } = harness();
    const month = await fetchFareMonth(http, CONFIG, {
      origin: 'HAN',
      destination: 'CUZ',
      month: '2027-02',
    });
    expect(month.prices).toEqual([]);
    expect(mapFareMonth(month.prices, month.currency)).toBeNull();
  });

  it('reads the found date from the result link and ignores links without one', () => {
    expect(foundAtFromLink('/search/X?t=1&search_date=24092026&x=1')).toBe(
      '2026-09-24T00:00:00.000Z',
    );
    expect(foundAtFromLink('/search/X?t=1')).toBeNull();
    expect(foundAtFromLink(undefined)).toBeNull();
  });
});
