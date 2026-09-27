/**
 * The Mapbox routing provider against recorded Mapbox Directions/Matrix responses for Kyoto
 * (./record-fixtures.ts re-records them); outages are simulated at the HTTP boundary only.
 */
import { describe, expect, it, vi } from 'vitest';

import { routeCrossesClosures } from '../../src/routing/closures';
import { createMapboxRoutingProvider } from '../../src/routing/eta';
import {
  MapboxRoutingClient,
  RoutingUnavailableError,
  type RoutingHttpClient,
} from '../../src/routing/mapbox';

import { hangingClient, loadExchanges, replayClient } from './http-fixtures';
import {
  ETA_SCENARIOS,
  LEAVE_BY_SCENARIOS,
  RECORDED_NOW,
  SHICHIJO_BRIDGE_CLOSURE,
} from './scenarios';

function providerFor(http: RoutingHttpClient, onProviderError?: (error: Error) => void) {
  return createMapboxRoutingProvider({
    client: new MapboxRoutingClient({ accessToken: 'test-token', http, timeoutMs: 50 }),
    now: () => RECORDED_NOW,
    ...(onProviderError !== undefined ? { onProviderError } : {}),
  });
}

function replay(scenario: string) {
  return replayClient(loadExchanges(scenario));
}

function statusClient(status: number): RoutingHttpClient {
  return { fetch: () => Promise.resolve(new Response('{"message":"upstream"}', { status })) };
}

describe('Mapbox routing provider: single ETAs', () => {
  it('walks Kyoto Station to Kiyomizu-dera on the walking profile', async () => {
    const http = replay('kyoto-walk');
    const result = await providerFor(http).eta(ETA_SCENARIOS['kyoto-walk']);
    expect(http.calls[0]).toMatch(/^\/directions\/v5\/mapbox\/walking\//);
    expect(result).toEqual({
      minutes: 45,
      distanceM: 3421,
      estimate: false,
      traffic: false,
      mode: 'pedestrian',
      source: 'mapbox',
    });
  });

  it('drives the same trip on driving-traffic with live traffic', async () => {
    const http = replay('kyoto-drive');
    const result = await providerFor(http).eta(ETA_SCENARIOS['kyoto-drive']);
    expect(http.calls[0]).toMatch(/^\/directions\/v5\/mapbox\/driving-traffic\//);
    expect(http.calls[0]).not.toContain('depart_at');
    expect(result).toMatchObject({ minutes: 15, distanceM: 3546, estimate: false, traffic: true });
  });

  it('sends depart_at for a future departure and returns the predicted-traffic ETA', async () => {
    const http = replay('kyoto-drive-depart-at');
    const result = await providerFor(http).eta(ETA_SCENARIOS['kyoto-drive-depart-at']);
    expect(http.calls[0]).toContain('depart_at=2026-10-01T00%3A00%3A00Z');
    expect(result).toMatchObject({ minutes: 17, estimate: false, traffic: true });
  });

  it('routes scooters on the cycling profile', async () => {
    const http = replay('kyoto-scooter');
    const result = await providerFor(http).eta(ETA_SCENARIOS['kyoto-scooter']);
    expect(http.calls[0]).toMatch(/^\/directions\/v5\/mapbox\/cycling\//);
    expect(result).toMatchObject({ minutes: 17, mode: 'motor_scooter', traffic: false });
  });

  it('returns a flagged estimate for transit without calling Mapbox', async () => {
    const http = replayClient([]);
    const result = await providerFor(http).eta({
      ...ETA_SCENARIOS['kyoto-walk'],
      mode: 'multimodal',
    });
    expect(http.calls).toEqual([]);
    expect(result).toMatchObject({
      estimate: true,
      estimateReason: 'transit_unsupported',
      source: 'straight_line',
      mode: 'multimodal',
    });
  });
});

describe('Mapbox routing provider: closures', () => {
  it('excludes points sampled from the closure polygon and the route moves off it', async () => {
    const plainHttp = replay('kyoto-drive');
    const closedHttp = replay('kyoto-drive-closure');
    const plainRoute = await new MapboxRoutingClient({
      accessToken: 't',
      http: plainHttp,
    }).directions({
      profile: 'driving-traffic',
      origin: {
        lng: ETA_SCENARIOS['kyoto-drive'].originLng,
        lat: ETA_SCENARIOS['kyoto-drive'].originLat,
      },
      dest: {
        lng: ETA_SCENARIOS['kyoto-drive'].destLng,
        lat: ETA_SCENARIOS['kyoto-drive'].destLat,
      },
    });
    expect(routeCrossesClosures(plainRoute.geometry, [SHICHIJO_BRIDGE_CLOSURE])).toBe(true);

    const result = await providerFor(closedHttp).eta(ETA_SCENARIOS['kyoto-drive-closure']);
    const exclude = new URL(`https://x${closedHttp.calls[0]!}`).searchParams.get('exclude') ?? '';
    const points = exclude.split(',');
    expect(points.length).toBeGreaterThan(0);
    expect(points.length).toBeLessThanOrEqual(50);
    expect(points.every((point) => /^point\(\S+ \S+\)$/.test(point))).toBe(true);
    expect(result.estimate).toBe(false);
    expect(result.distanceM).not.toBe(3546);

    const body = loadExchanges('kyoto-drive-closure')[0]!.body as {
      routes: { geometry: { coordinates: [number, number][] } }[];
    };
    const geometry = body.routes[0]!.geometry.coordinates;
    expect(routeCrossesClosures(geometry, [SHICHIJO_BRIDGE_CLOSURE])).toBe(false);
  });

  it('does not send exclusions on the walking profile, which ignores them', async () => {
    const http = replay('kyoto-walk');
    await providerFor(http).eta({
      ...ETA_SCENARIOS['kyoto-walk'],
      closures: [SHICHIJO_BRIDGE_CLOSURE],
    });
    expect(http.calls[0]).not.toContain('exclude');
  });
});

describe('Mapbox routing provider: fallback', () => {
  it('falls back to a flagged straight-line estimate when Mapbox times out', async () => {
    const onProviderError = vi.fn();
    const result = await providerFor(hangingClient, onProviderError).eta(
      ETA_SCENARIOS['kyoto-drive'],
    );
    expect(result).toMatchObject({
      estimate: true,
      estimateReason: 'provider_unavailable',
      source: 'straight_line',
      traffic: false,
    });
    expect(result.minutes).toBeGreaterThan(0);
    expect(onProviderError).toHaveBeenCalledOnce();
    const error = onProviderError.mock.calls[0]![0] as RoutingUnavailableError;
    expect(error).toBeInstanceOf(RoutingUnavailableError);
    expect(error.reason).toBe('timeout');
  });

  it.each([
    [503, 'upstream_error'],
    [429, 'rate_limited'],
    [401, 'unauthorized'],
  ])('falls back on HTTP %i (%s)', async (status, reason) => {
    const onProviderError = vi.fn();
    const result = await providerFor(statusClient(status), onProviderError).eta(
      ETA_SCENARIOS['kyoto-walk'],
    );
    expect(result).toMatchObject({ estimate: true, estimateReason: 'provider_unavailable' });
    expect((onProviderError.mock.calls[0]![0] as RoutingUnavailableError).reason).toBe(reason);
  });

  it('never puts the access token in an error message', async () => {
    const onProviderError = vi.fn();
    await providerFor(statusClient(500), onProviderError).eta(ETA_SCENARIOS['kyoto-walk']);
    expect(String(onProviderError.mock.calls[0]![0])).not.toContain('test-token');
  });
});

describe('Mapbox routing provider: leave-by', () => {
  it('re-queries driving-traffic at the corrected departure and leaves that long before arrival', async () => {
    const http = replay('kyoto-leave-by-drive');
    const result = await providerFor(http).leaveBy(LEAVE_BY_SCENARIOS['kyoto-leave-by-drive']);
    expect(http.calls).toHaveLength(2);
    expect(http.calls.every((call) => call.includes('/driving-traffic/'))).toBe(true);
    expect(http.calls[1]).toContain('depart_at=2026-10-01T00%3A13%3A00Z');
    expect(result.eta).toMatchObject({ minutes: 17, traffic: true, estimate: false });
    expect(result.leaveAt.toISOString()).toBe('2026-10-01T00:13:00.000Z');
  });

  it('computes leave-by from the fallback estimate when Mapbox is down', async () => {
    const result = await providerFor(hangingClient).leaveBy(
      LEAVE_BY_SCENARIOS['kyoto-leave-by-drive'],
    );
    expect(result.eta.estimate).toBe(true);
    expect(result.leaveAt.getTime()).toBe(
      LEAVE_BY_SCENARIOS['kyoto-leave-by-drive'].arriveBy.getTime() - result.eta.minutes * 60_000,
    );
  });
});
