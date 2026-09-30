/**
 * Affiliate links on recorded and published Travelpayouts responses: every partner page lands on
 * the partner's own domain, the conversion request carries our marker, project and the click's
 * opaque sub id, an unsubscribed brand or a refused marker hides the call to action, and CJ and
 * Viator links carry their partner ids and the sub id. Booking statistics map to conversions.
 */
import path from 'node:path';

import type { AffiliatePartner } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import { createSupplierHttp } from '../../src/core/http';
import { bookingCjLink } from '../../src/booking-cj/links';
import { buildAffiliateLink, partnerPageFor } from '../../src/links/affiliate-link';
import type { LinkTarget } from '../../src/links/link-spec';
import { createPartnerLinks } from '../../src/travelpayouts/links/client';
import { fetchActionsSince } from '../../src/travelpayouts/links/statistics';
import { viatorAffiliateLink } from '../../src/viator/links';
import { recordedFetch, type RecordedRoute } from '../helpers/recorded-fetch';

const FIXTURES = path.resolve(import.meta.dirname, 'fixtures');
const CONFIG = { token: 'test-token', marker: 339296, trs: 197987 };
const SUB_ID = 'AbCdEfGhIjKlMnOpQr_1';
const STAY: LinkTarget = {
  kind: 'stay',
  query: 'Ubud',
  checkIn: '2026-11-12',
  checkOut: '2026-11-15',
  adults: 4,
  rooms: 2,
};

function httpWith(routes: readonly RecordedRoute[]) {
  const recorded = recordedFetch(FIXTURES, routes);
  const http = createSupplierHttp({ fetch: recorded.fetch, audit: () => Promise.resolve() });
  return { http, requests: recorded.requests };
}

const LINKS_SAMPLE = { path: '/links/v1/create', file: 'links-create-published-sample.json' };

describe('partner pages', () => {
  const partners: [AffiliatePartner, string][] = [
    ['agoda', 'www.agoda.com'],
    ['trip_com', 'www.trip.com'],
    ['klook', 'www.klook.com'],
    ['gyg', 'www.getyourguide.com'],
    ['kiwitaxi', 'kiwitaxi.com'],
    ['gettransfer', 'gettransfer.com'],
  ];

  it.each(partners)('builds %s on its own domain', (partner, host) => {
    const page = partnerPageFor(partner, STAY);
    expect(page).not.toBeNull();
    expect(new URL(page!).hostname).toBe(host);
  });

  it('keeps a curated page on the partner domain and ignores one elsewhere', () => {
    const curated = partnerPageFor('agoda', {
      ...STAY,
      pageUrl: 'https://www.agoda.com/the-villa/hotel/bali-id.html',
    });
    expect(curated).toBe('https://www.agoda.com/the-villa/hotel/bali-id.html');
    const foreign = partnerPageFor('agoda', { ...STAY, pageUrl: 'https://evil.example/agoda.com' });
    expect(new URL(foreign!).hostname).toBe('www.agoda.com');
  });

  it('carries the dates and party size into the stay search', () => {
    const page = new URL(partnerPageFor('trip_com', STAY)!);
    expect(Object.fromEntries(page.searchParams)).toEqual({
      keyword: 'Ubud',
      checkin: '2026-11-12',
      checkout: '2026-11-15',
      adult: '4',
    });
  });
});

describe('Travelpayouts partner links', () => {
  it('sends our marker, project and the sub id, long links only, token in the header', async () => {
    const { http, requests } = httpWith([LINKS_SAMPLE]);
    await createPartnerLinks(http, CONFIG, [
      { url: partnerPageFor('agoda', STAY)!, subId: SUB_ID },
    ]);
    const sent = requests[0]!;
    expect(sent.method).toBe('POST');
    expect(sent.headers.get('X-Access-Token')).toBe('test-token');
    expect(sent.url.search).toBe('');
    expect(JSON.parse(sent.body!)).toEqual({
      trs: 197987,
      marker: 339296,
      shorten: false,
      links: [{ url: partnerPageFor('agoda', STAY), sub_id: SUB_ID }],
    });
  });

  it('maps converted, unsubscribed and unsupported links in order', async () => {
    const { http } = httpWith([LINKS_SAMPLE]);
    const results = await createPartnerLinks(http, CONFIG, [
      { url: 'https://yesim.app/country/turkey/3days-500mb-esim-data-plan/', subId: SUB_ID },
      { url: 'https://www.airalo.com/ru/georgia-esim/kargi-mobile-7days-1gb', subId: SUB_ID },
      { url: 'https://www.amazon.com/travel/?__rr=1', subId: SUB_ID },
    ]);
    expect(results).toEqual([
      {
        ok: true,
        url: 'https://yesim.app/country/turkey/3days-500mb-esim-data-plan/',
        partnerUrl: 'https://yesim.tp.st/kn3kv29H?erid=2VtzqwiKLkx',
      },
      {
        ok: false,
        url: 'https://www.airalo.com/ru/georgia-esim/kargi-mobile-7days-1gb',
        reason: 'not_subscribed',
      },
      { ok: false, url: 'https://www.amazon.com/travel/?__rr=1', reason: 'unsupported' },
    ]);
  });

  it('hides the call to action when the account refuses our marker', async () => {
    const { http } = httpWith([
      { path: '/links/v1/create', file: 'links-create-invalid-marker.json', status: 400 },
    ]);
    await expect(
      buildAffiliateLink(http, { travelpayouts: CONFIG }, 'agoda', STAY, SUB_ID),
    ).rejects.toMatchObject({ code: 'SUPPLIER_UNAVAILABLE', detail: { reason: 'configuration' } });
  });

  it('hides a partner whose programme is not configured, without a network call', async () => {
    const { http, requests } = httpWith([LINKS_SAMPLE]);
    await expect(buildAffiliateLink(http, {}, 'klook', STAY, SUB_ID)).rejects.toMatchObject({
      code: 'SUPPLIER_UNAVAILABLE',
      detail: { reason: 'not_configured' },
    });
    expect(requests).toHaveLength(0);
  });
});

describe('CJ and Viator links', () => {
  it('sends Booking.com through CJ with our ids and the sub id', () => {
    const link = new URL(bookingCjLink({ publisherId: '101', adId: '202' }, STAY, SUB_ID));
    expect(link.origin).toBe('https://www.anrdoezrs.net');
    expect(link.pathname).toBe('/click-101-202');
    expect(link.searchParams.get('sid')).toBe(SUB_ID);
    const landing = new URL(link.searchParams.get('url')!);
    expect(landing.hostname).toBe('www.booking.com');
    expect(landing.searchParams.get('ss')).toBe('Ubud');
  });

  it('carries our Viator partner id and the sub id as the campaign', () => {
    const link = new URL(
      viatorAffiliateLink(
        { pid: 'P00012345', mcid: '42383' },
        { kind: 'activity', query: 'Ubud' },
        SUB_ID,
      ),
    );
    expect(link.hostname).toBe('www.viator.com');
    expect(link.searchParams.get('pid')).toBe('P00012345');
    expect(link.searchParams.get('mcid')).toBe('42383');
    expect(link.searchParams.get('campaign')).toBe(SUB_ID);
  });
});

describe('Travelpayouts booking statistics', () => {
  it('reads an account with no bookings yet as no conversions', async () => {
    const { http, requests } = httpWith([
      { path: '/statistics/v1/execute_query', file: 'statistics-actions-since-2026-09-01.json' },
    ]);
    const page = await fetchActionsSince(http, { token: 'test-token' }, '2026-09-01');
    expect(page).toEqual({ actions: [], totalRows: 0 });
    const body = JSON.parse(requests[0]!.body!) as { filters: unknown[] };
    expect(body.filters).toContainEqual({ field: 'date', op: 'ge', value: '2026-09-01' });
  });

  it('maps a paid booking to cents with its sub id', async () => {
    const { http } = httpWith([
      { path: '/statistics/v1/execute_query', file: 'statistics-actions-published-sample.json' },
    ]);
    const page = await fetchActionsSince(http, { token: 'test-token' }, '2025-06-22');
    expect(page.actions).toEqual([
      {
        externalId: 'b91cb378-770e-55c7-b126d10',
        campaignId: null,
        subId: '.mobile_app_5f78c121aea424a64',
        status: 'paid',
        priceMinor: 428800,
        commissionMinor: 4714,
        occurredOn: '2025-06-23',
        updatedAt: '2025-06-24 10:28:44',
      },
    ]);
  });
});
