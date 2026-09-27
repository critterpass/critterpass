/**
 * `readThrough` and each route's classification over recorded api answers: fresh answers are
 * `ok`, stale ones say why, nothing-to-show is `missing`, and offline serves the last good copy as
 * stale (or `missing` when there never was one).
 */
import {
  crowdsResponseSchema,
  destinationInsightsSchema,
  faresResponseSchema,
  hazardsResponseSchema,
  marineResponseSchema,
  weatherResponseSchema,
} from '@cp/domain';
import { describe, expect, it } from '@jest/globals';

import { createLastGoodCache, createTravelDataReader, readThrough } from '../client';
import { classifyCrowds } from '../useCrowds';
import { classifyInsights } from '../useDestinationInsights';
import { classifyFares, faresPath } from '../useFares';
import { classifyHazards } from '../useHazards';
import { classifyForecast } from '../useWeather';
import { recorded, recordedReader } from '../test-support/recorded-reader';

let cacheId = 0;
const freshCache = () => createLastGoodCache(`travel-data-test-${String((cacheId += 1))}`);

describe('route classifications (recorded answers)', () => {
  it('fares: ok with the latest seen time; a hub-borrowed fare stays labelled', () => {
    const data = faresResponseSchema.parse(recorded('fares-bali-2026-11'));
    expect(classifyFares(data)).toMatchObject({ status: 'ok' });
    expect(data.fares.map((fare) => [fare.origin, fare.state, fare.via_hub])).toEqual([
      ['SIN', 'ok', null],
      ['KUL', 'stale', null],
      ['HAN', 'ok', 'HKG'],
    ]);
    expect(data.fares[1]?.price_minor).toBeNull();
  });

  it('fares: only stale prices read stale, none at all read missing', () => {
    const data = faresResponseSchema.parse(recorded('fares-bali-2026-11'));
    const staleOnly = { ...data, fares: data.fares.filter((fare) => fare.state === 'stale') };
    expect(classifyFares(staleOnly)).toMatchObject({ status: 'stale', reason: 'old' });
    expect(classifyFares({ ...data, fares: [] })).toEqual({ status: 'missing' });
  });

  it('destination insights: Kyoto with its curve, Bali with curve null and best months', () => {
    const kyoto = destinationInsightsSchema.parse(recorded('destination-kyoto'));
    expect(classifyInsights(kyoto).status).toBe('ok');
    expect(kyoto.curve).toHaveLength(12);
    const bali = destinationInsightsSchema.parse(recorded('destination-bali-no-curve'));
    expect(bali.curve).toBeNull();
    expect(bali.best_months).toEqual([3, 4, 10, 11]);
  });

  it('crowds: month level only is ok, neither hourly nor month is missing', () => {
    const monthOnly = crowdsResponseSchema.parse(recorded('crowds-month-only'));
    expect(monthOnly.hourly).toBeNull();
    expect(classifyCrowds(monthOnly).status).toBe('ok');
    expect(classifyCrowds(crowdsResponseSchema.parse(recorded('crowds-with-pattern'))).status).toBe(
      'ok',
    );
    expect(classifyCrowds(crowdsResponseSchema.parse(recorded('crowds-none')))).toEqual({
      status: 'missing',
    });
  });

  it('weather: a failed last refresh reads stale, nothing nearby reads missing', () => {
    const stale = weatherResponseSchema.parse(recorded('weather-bali-stale'));
    expect(classifyForecast(stale)).toMatchObject({ status: 'stale', reason: 'refresh_failed' });
    expect(classifyForecast(weatherResponseSchema.parse(recorded('weather-none')))).toEqual({
      status: 'missing',
    });
    const summit = weatherResponseSchema.parse(recorded('weather-bali-summit'));
    expect(classifyForecast(summit).status).toBe('ok');
    expect(summit.attribution.text).toBe('Powered by WeatherAPI.com');
    expect(classifyForecast(marineResponseSchema.parse(recorded('marine-bali'))).status).toBe('ok');
  });

  it('hazards: an alert not read lately makes the list stale', () => {
    expect(classifyHazards(hazardsResponseSchema.parse(recorded('hazards-bali')))).toMatchObject({
      status: 'stale',
      reason: 'old',
    });
  });
});

describe('readThrough', () => {
  const input = { origins: ['SIN', 'KUL', 'HAN'], dest: 'bali', month: '2026-11' };
  const path = faresPath(input) ?? '';

  it('keeps the good answer and serves it as stale when the device goes offline', async () => {
    const reader = recordedReader({ '/v1/fares': [200, 'fares-bali-2026-11'] });
    const cache = freshCache();
    const args = { reader, cache, path, schema: faresResponseSchema, classify: classifyFares };
    const online = await readThrough(args);
    expect(online).toMatchObject({ status: 'ok', source: 'network' });

    reader.online = false;
    const offline = await readThrough(args);
    expect(offline).toMatchObject({ status: 'stale', source: 'cache', reason: 'offline' });
    expect(offline.status === 'stale' ? offline.data.fares : []).toHaveLength(3);
  });

  it('is missing offline when there never was a good answer', async () => {
    const reader = recordedReader({});
    reader.online = false;
    const state = await readThrough({
      reader,
      cache: freshCache(),
      path,
      schema: faresResponseSchema,
      classify: classifyFares,
    });
    expect(state).toEqual({ status: 'missing', reason: 'offline' });
  });

  it('turns a 404 into not_found and a server error into the last copy, marked stale', async () => {
    const cache = freshCache();
    const notFound = await readThrough({
      reader: recordedReader({ '/v1/fares': [404, 'error-not-found'] }),
      cache,
      path,
      schema: faresResponseSchema,
      classify: classifyFares,
    });
    expect(notFound).toEqual({ status: 'missing', reason: 'not_found' });

    await readThrough({
      reader: recordedReader({ '/v1/fares': [200, 'fares-bali-2026-11'] }),
      cache,
      path,
      schema: faresResponseSchema,
      classify: classifyFares,
    });
    const failed = await readThrough({
      reader: recordedReader({ '/v1/fares': [503, 'error-not-found'] }),
      cache,
      path,
      schema: faresResponseSchema,
      classify: classifyFares,
    });
    expect(failed).toMatchObject({ status: 'stale', reason: 'refresh_failed', source: 'cache' });
  });

  it('never shows an answer that fails the wire shape', async () => {
    const state = await readThrough({
      reader: recordedReader({ '/v1/fares': [200, 'hazards-bali'] }),
      cache: freshCache(),
      path,
      schema: faresResponseSchema,
      classify: classifyFares,
    });
    expect(state).toEqual({ status: 'missing', reason: 'error' });
  });
});

describe('createTravelDataReader', () => {
  it('sends the session headers and parses the recorded answer', async () => {
    const seen: { url: string; headers: Record<string, string> }[] = [];
    const reader = createTravelDataReader({
      baseUrl: 'https://api.test',
      sessionHeaders: () => Promise.resolve({ cookie: 'session=abc' }),
      fetch: (url, init) => {
        seen.push({
          url: url instanceof Request ? url.url : url.toString(),
          headers: (init?.headers ?? {}) as Record<string, string>,
        });
        return Promise.resolve(
          new Response(JSON.stringify(recorded('hazards-bali')), { status: 200 }),
        );
      },
    });
    const response = await reader.getJson('/v1/hazards?destination_id=bali');
    expect(response.status).toBe(200);
    expect(hazardsResponseSchema.safeParse(response.body).success).toBe(true);
    expect(seen).toEqual([
      {
        url: 'https://api.test/v1/hazards?destination_id=bali',
        headers: { accept: 'application/json', cookie: 'session=abc' },
      },
    ]);
  });
});
