/**
 * Matrices: block planning against Mapbox's coordinate caps, and full runs replayed from recorded
 * Mapbox Matrix responses (a single traffic request and a 20x20 split into four requests).
 */
import { describe, expect, it } from 'vitest';

import { createMapboxRoutingProvider } from '../../src/routing/eta';
import { MapboxRoutingClient, type RoutingHttpClient } from '../../src/routing/mapbox';
import {
  MATRIX_COORDINATE_LIMIT,
  MATRIX_TRAFFIC_COORDINATE_LIMIT,
  planMatrixBlocks,
} from '../../src/routing/matrix';
import { mapboxMatrixProfileFor } from '../../src/routing/modes';

import { hangingClient, loadExchanges, replayClient } from './http-fixtures';
import { MATRIX_SCENARIOS, RECORDED_NOW } from './scenarios';

function providerFor(http: RoutingHttpClient) {
  return createMapboxRoutingProvider({
    client: new MapboxRoutingClient({ accessToken: 'test-token', http, timeoutMs: 50 }),
    now: () => RECORDED_NOW,
  });
}

function coverage(originCount: number, destCount: number, limit: number): number[][] {
  const seen = Array.from({ length: originCount }, () => new Array<number>(destCount).fill(0));
  for (const block of planMatrixBlocks(originCount, destCount, limit)) {
    expect(block.sourceCount + block.destCount).toBeLessThanOrEqual(limit);
    for (let i = 0; i < block.sourceCount; i++) {
      for (let j = 0; j < block.destCount; j++)
        seen[block.sourceStart + i]![block.destStart + j]!++;
    }
  }
  return seen;
}

describe('planMatrixBlocks', () => {
  it('fits a small matrix in one request', () => {
    expect(planMatrixBlocks(3, 3, MATRIX_COORDINATE_LIMIT)).toHaveLength(1);
  });

  it('splits a 50x50 into 20 requests of at most 25 coordinates, covering every cell once', () => {
    expect(planMatrixBlocks(50, 50, MATRIX_COORDINATE_LIMIT)).toHaveLength(20);
    expect(
      coverage(50, 50, MATRIX_COORDINATE_LIMIT)
        .flat()
        .every((count) => count === 1),
    ).toBe(true);
  });

  it('handles lopsided shapes (1 origin to 50 destinations)', () => {
    expect(planMatrixBlocks(1, 50, MATRIX_COORDINATE_LIMIT)).toHaveLength(3);
    expect(
      coverage(1, 50, MATRIX_COORDINATE_LIMIT)
        .flat()
        .every((count) => count === 1),
    ).toBe(true);
  });

  it('uses driving-traffic only while the whole matrix fits one traffic request', () => {
    expect(mapboxMatrixProfileFor('auto', 6, MATRIX_TRAFFIC_COORDINATE_LIMIT)).toBe(
      'driving-traffic',
    );
    expect(mapboxMatrixProfileFor('auto', 11, MATRIX_TRAFFIC_COORDINATE_LIMIT)).toBe('driving');
    expect(mapboxMatrixProfileFor('pedestrian', 40, MATRIX_TRAFFIC_COORDINATE_LIMIT)).toBe(
      'walking',
    );
    expect(
      mapboxMatrixProfileFor('multimodal', 2, MATRIX_TRAFFIC_COORDINATE_LIMIT),
    ).toBeUndefined();
  });
});

describe('Mapbox routing provider: matrix', () => {
  it('returns a 3x3 Kyoto drive matrix with traffic in one request', async () => {
    const http = replayClient(loadExchanges('kyoto-matrix-drive'));
    const result = await providerFor(http).matrix(MATRIX_SCENARIOS['kyoto-matrix-drive']);
    expect(http.calls).toHaveLength(1);
    expect(http.calls[0]).toMatch(/^\/directions-matrix\/v1\/mapbox\/driving-traffic\//);
    expect(result).toMatchObject({ estimate: false, traffic: true, source: 'mapbox', requests: 1 });
    expect(result.minutes).toEqual([
      [15, 14, 27],
      [14, 15, 26],
      [29, 31, 15],
    ]);
  });

  it('stitches a 20x20 walking matrix from four chunked requests in the right cells', async () => {
    const http = replayClient(loadExchanges('kyoto-matrix-walk-chunked'));
    const input = MATRIX_SCENARIOS['kyoto-matrix-walk-chunked'];
    const result = await providerFor(http).matrix(input);
    expect(result.requests).toBe(4);
    expect(http.calls).toHaveLength(4);
    for (const call of http.calls) {
      const coordinates = call.split('?')[0]!.split('/').at(-1)!.split(';');
      expect(coordinates.length).toBeLessThanOrEqual(MATRIX_COORDINATE_LIMIT);
    }
    expect(result.minutes).toHaveLength(20);
    expect(
      result.minutes.every((row) => row.length === 20 && row.every((cell) => cell !== null)),
    ).toBe(true);
    // Origins and destinations are the same points: only a correctly stitched matrix has a zero
    // diagonal and positive times everywhere else.
    result.distanceM.forEach((row, i) =>
      row.forEach((cell, j) => {
        if (i === j) expect(cell).toBe(0);
        else expect(cell).toBeGreaterThan(0);
      }),
    );
  });

  it('falls back to a flagged straight-line matrix when Mapbox times out', async () => {
    const result = await providerFor(hangingClient).matrix(MATRIX_SCENARIOS['kyoto-matrix-drive']);
    expect(result).toMatchObject({
      estimate: true,
      estimateReason: 'provider_unavailable',
      source: 'straight_line',
      requests: 0,
    });
    expect(result.minutes.flat()).toHaveLength(9);
  });

  it('estimates transit matrices without calling Mapbox', async () => {
    const http = replayClient([]);
    const result = await providerFor(http).matrix({
      ...MATRIX_SCENARIOS['kyoto-matrix-drive'],
      mode: 'multimodal',
    });
    expect(http.calls).toEqual([]);
    expect(result).toMatchObject({ estimate: true, estimateReason: 'transit_unsupported' });
  });
});
