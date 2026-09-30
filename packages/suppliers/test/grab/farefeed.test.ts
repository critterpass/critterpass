/**
 * Grab Farefeed on Grab's published samples: the client-credentials token is fetched once and
 * reused, the estimate request carries pickup and drop-off, the card leads with the soonest pickup,
 * surge maps to our vocabulary; switched off, unconfigured or failing, the quote still answers the
 * market's plain app links and never calls Grab.
 */
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { createSupplierHttp } from '../../src/core/http';
import { createGrabTokenSource, GRAB_STAGING_URL } from '../../src/grab/oauth';
import { quoteRide } from '../../src/rides/quote';
import { recordedFetch } from '../helpers/recorded-fetch';

const FIXTURES = path.resolve(import.meta.dirname, 'fixtures');
const config = { clientId: 'cid', clientSecret: 'secret', baseUrl: GRAB_STAGING_URL };
const AIRPORT = { lat: -8.748, lng: 115.167, name: 'Ngurah Rai airport' };
const UBUD = { lat: -8.5069, lng: 115.2625, name: 'Ubud Palace' };

function grab(status = 200) {
  const recorded = recordedFetch(FIXTURES, [
    { path: '/grabid/v1/oauth2/token', file: 'oauth-token-published-sample.json' },
    { path: '/farefeed/v1/estimate', file: 'farefeed-estimate-published-sample.json', status },
  ]);
  const http = createSupplierHttp({ fetch: recorded.fetch, audit: () => Promise.resolve() });
  return {
    estimator: { http, config, tokens: createGrabTokenSource(http, config) },
    requests: recorded.requests,
  };
}

describe('grab farefeed', () => {
  it('estimates the soonest pickup with its fare range and deep link, fetching the token once', async () => {
    const { estimator, requests } = grab();
    const request = {
      apps: ['grab', 'gojek'] as const,
      estimateEnabled: true,
      from: AIRPORT,
      to: UBUD,
    };
    const first = await quoteRide(estimator, request);
    await quoteRide(estimator, request);
    expect(first.estimate).toMatchObject({
      name: 'JustGrab',
      etaMin: 3,
      currency: 'SGD',
      minFare: 57,
      maxFare: 74.1,
      surge: 'low',
    });
    expect(first.estimate?.deepLink).toMatch(/^https:\/\/grab\.onelink\.me\//);
    expect(first.links.map((link) => link.provider)).toEqual(['grab', 'gojek']);
    const tokenCalls = requests.filter((r) => r.url.pathname.endsWith('/oauth2/token'));
    expect(tokenCalls).toHaveLength(1);
    expect(tokenCalls[0]?.body).toContain('scope=ride.estimate');
    const estimate = requests.find((r) => r.url.pathname === '/farefeed/v1/estimate');
    expect(estimate?.headers.get('authorization')).toBe('Bearer sample-access-token');
    expect(JSON.parse(estimate?.body ?? '{}')).toMatchObject({
      pickUp: { latitude: AIRPORT.lat, longitude: AIRPORT.lng },
      dropOff: { latitude: UBUD.lat, longitude: UBUD.lng, address: 'Ubud Palace' },
    });
  });

  it('answers plain links without calling Grab when the switch is off or Grab is not set up', async () => {
    const { estimator, requests } = grab();
    const off = await quoteRide(estimator, {
      apps: ['grab'],
      estimateEnabled: false,
      from: AIRPORT,
      to: UBUD,
    });
    expect(off).toMatchObject({ estimate: null, estimateSkipped: 'flag_off' });
    expect(off.links[0]?.app_url).toContain('grab://open?screenType=BOOKING');
    expect(off.links[0]?.app_url).toContain('dropOffLatitude=-8.506900');
    const unset = await quoteRide(undefined, {
      apps: ['grab'],
      estimateEnabled: true,
      from: AIRPORT,
      to: UBUD,
    });
    expect(unset.estimateSkipped).toBe('not_configured');
    expect(requests).toHaveLength(0);
  });

  it('keeps the links when Farefeed fails, and offers Uber where Grab does not run', async () => {
    const { estimator } = grab(500);
    const failed = await quoteRide(estimator, {
      apps: ['grab'],
      estimateEnabled: true,
      from: AIRPORT,
      to: UBUD,
    });
    expect(failed.estimateSkipped).toBe('failed');
    expect(failed.links).toHaveLength(1);
    const lisbon = await quoteRide(estimator, {
      apps: ['uber'],
      estimateEnabled: true,
      from: AIRPORT,
      to: { lat: 38.7139, lng: -9.1334, name: 'Castelo de São Jorge' },
    });
    expect(lisbon.estimateSkipped).toBe('no_grab');
    expect(lisbon.links[0]?.app_url).toMatch(/^https:\/\/m\.uber\.com\/ul\/\?action=setPickup/);
  });
});
