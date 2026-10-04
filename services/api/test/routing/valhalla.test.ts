/**
 * The shared Valhalla client against responses recorded from a live router (Đà Nẵng, Bali, Kyoto;
 * `packages/suppliers/src/valhalla/fixtures/record.ts`): the parsed contract, the error kinds
 * callers branch on, matrix chunking, and the timeout, retry and circuit-breaker behaviour.
 * Timeouts and HTTP failures are simulated at the fetch boundary only.
 */
import {
  createCircuitBreaker,
  createValhallaClient,
  ValhallaError,
  type ValhallaClientOptions,
  type ValhallaPoint,
} from '@cp/suppliers';
import { describe, expect, it } from 'vitest';

import {
  jsonResponse as json,
  loadValhallaScenario as load,
  replayValhalla as replay,
} from '../../../../packages/suppliers/src/valhalla/fixtures/replay';

const BASE = 'http://valhalla.test:8002';

function client(
  fetch: NonNullable<ValhallaClientOptions['fetch']>,
  extra: Omit<Partial<ValhallaClientOptions>, 'fetch'> = {},
) {
  return createValhallaClient({ baseUrl: BASE, fetch, ...extra });
}

const P = {
  dragonBridge: { lat: 16.0611, lng: 108.2272 },
  myKhe: { lat: 16.0544, lng: 108.247 },
  marble: { lat: 16.0039, lng: 108.2633 },
  hanMarket: { lat: 16.0682, lng: 108.2242 },
  seminyak: { lat: -8.6913, lng: 115.1682 },
  ubud: { lat: -8.5188, lng: 115.2585 },
  tanahLot: { lat: -8.6212, lng: 115.0868 },
  uluwatu: { lat: -8.8291, lng: 115.0849 },
  station: { lat: 34.9858, lng: 135.7588 },
  kiyomizu: { lat: 34.9949, lng: 135.785 },
  fushimi: { lat: 34.9671, lng: 135.7727 },
  gion: { lat: 35.0037, lng: 135.7788 },
  sea: { lat: 15.5, lng: 109.5 },
} satisfies Record<string, ValhallaPoint>;

const BALI = [P.seminyak, P.ubud, P.tanahLot, P.uluwatu];

describe('valhalla route', () => {
  it.each([
    ['danang-route-drive', [P.dragonBridge, P.marble], 'auto'],
    ['bali-route-drive', [P.seminyak, P.ubud], 'auto'],
    ['kyoto-route-walk', [P.station, P.kiyomizu], 'pedestrian'],
  ] as const)(
    '%s: seconds and metres from the recorded summary',
    async (scenario, points, costing) => {
      const { exchanges, fetch } = replay(scenario);
      const route = await client(fetch).route(points, costing);
      const summary = (
        exchanges[0]?.response as { trip: { summary: { time: number; length: number } } }
      ).trip.summary;
      expect(route.seconds).toBe(summary.time);
      expect(route.meters).toBe(Math.round(summary.length * 1000));
      expect(route.legs).toHaveLength(1);
      expect(route.seconds).toBeGreaterThan(60);
    },
  );

  it('a point at sea is off_graph, a cross-sea drive is over the limit', async () => {
    await expect(
      client(replay('danang-route-off-graph').fetch).route([P.sea, P.myKhe], 'auto'),
    ).rejects.toMatchObject({
      kind: 'off_graph',
      detail: { status: 400, valhallaCode: 171 },
    });
    await expect(
      client(replay('route-over-limit').fetch).route([P.dragonBridge, P.ubud], 'auto'),
    ).rejects.toMatchObject({ kind: 'limit', detail: { valhallaCode: 154 } });
  });

  it('keeps the visiting order of an optimised loop, ends fixed', async () => {
    const route = await client(replay('kyoto-optimized-walk').fetch).optimizedRoute(
      [P.station, P.kiyomizu, P.fushimi, P.gion, P.station],
      'pedestrian',
    );
    expect(route.order).toEqual([0, 3, 1, 2, 4]);
    expect(route.legs).toHaveLength(4);
    expect(route.seconds).toBeCloseTo(
      route.legs.reduce((sum, leg) => sum + leg.seconds, 0),
      0,
    );
  });
});

describe('valhalla matrix', () => {
  it('reads a walk matrix cell by cell', async () => {
    const { calls, fetch } = replay('danang-matrix-walk');
    const matrix = await client(fetch).matrix(
      [P.dragonBridge, P.hanMarket],
      [P.myKhe, P.marble, P.hanMarket],
      'pedestrian',
    );
    expect(calls).toEqual(['/sources_to_targets']);
    expect(matrix.seconds).toHaveLength(2);
    expect(
      matrix.seconds.every((row) => row.length === 3 && row.every((cell) => cell !== null)),
    ).toBe(true);
    expect(matrix.seconds[1]?.[2]).toBe(0);
  });

  it('leaves only the off-graph rows empty instead of failing the matrix', async () => {
    const { calls, fetch } = replay('danang-matrix-off-graph');
    const matrix = await client(fetch).matrix([P.dragonBridge, P.sea], [P.myKhe], 'auto');
    expect(calls).toEqual(['/sources_to_targets', '/locate', '/sources_to_targets']);
    expect(matrix.seconds[0]?.[0]).toBeGreaterThan(0);
    expect(matrix.seconds[1]?.[0]).toBeNull();
    expect(matrix.meters[1]?.[0]).toBeNull();
  });

  /** Answers any block from the recorded Bali 4 × 4 drive matrix, so chunking can be checked. */
  function baliBlocks() {
    const recorded = load('bali-matrix-drive')[0]?.response as {
      sources_to_targets: { time: number | null; distance: number | null }[][];
    };
    const index = (location: { lat: number; lon: number }) =>
      BALI.findIndex((point) => point.lat === location.lat && point.lng === location.lon);
    const blocks: [number, number][] = [];
    const fetch = (_input: string | URL, init?: RequestInit) => {
      const body = JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as Record<
        'sources' | 'targets',
        { lat: number; lon: number }[]
      >;
      blocks.push([body.sources.length, body.targets.length]);
      const rows = body.sources.map((source) =>
        body.targets.map(
          (destination) => recorded.sources_to_targets[index(source)]?.[index(destination)],
        ),
      );
      return Promise.resolve(json(200, { sources_to_targets: rows }));
    };
    return { recorded, blocks, fetch };
  }

  it('splits into blocks and stitches them back in input order', async () => {
    const { recorded, blocks, fetch } = baliBlocks();
    const matrix = await client(fetch, { maxMatrixSide: 3 }).matrix(BALI, BALI, 'auto');
    expect(matrix.requests).toBe(4);
    expect(blocks.sort()).toEqual([
      [1, 1],
      [1, 3],
      [3, 1],
      [3, 3],
    ]);
    expect(matrix.seconds).toEqual(
      recorded.sources_to_targets.map((row) => row.map((cell) => cell.time)),
    );
  });

  it('never sends a block larger than 25 × 25', async () => {
    const { blocks, fetch } = baliBlocks();
    const many = Array.from({ length: 30 }, (_, i) => BALI[i % 4] ?? P.ubud);
    const matrix = await client(fetch, { maxMatrixSide: 100 }).matrix(many, many, 'auto');
    expect(matrix.requests).toBe(4);
    expect(Math.max(...blocks.flat())).toBe(25);
    expect(matrix.seconds[29]?.[28]).not.toBeNull();
  });
});

describe('valhalla failures', () => {
  const hanging = (_input: string | URL, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    });

  it('times out at the route deadline, after one retry', async () => {
    let attempts = 0;
    const fetch = (input: string | URL, init?: RequestInit) => {
      attempts += 1;
      return hanging(input, init);
    };
    await expect(
      client(fetch, { routeTimeoutMs: 20 }).route([P.seminyak, P.ubud], 'auto'),
    ).rejects.toMatchObject({
      kind: 'timeout',
    });
    expect(attempts).toBe(2);
  });

  it('retries a 503 once and returns the second answer', async () => {
    const recorded = replay('bali-route-drive');
    let attempts = 0;
    const fetch = (input: string | URL, init?: RequestInit) => {
      attempts += 1;
      return attempts === 1 ? Promise.resolve(json(503, {})) : recorded.fetch(input, init);
    };
    const route = await client(fetch).route([P.seminyak, P.ubud], 'auto');
    expect(route.seconds).toBeGreaterThan(0);
    expect(attempts).toBe(2);
  });

  it('does not retry an answer from a healthy router', async () => {
    const { calls, fetch } = replay('danang-route-off-graph');
    await expect(client(fetch).route([P.sea, P.myKhe], 'auto')).rejects.toBeInstanceOf(
      ValhallaError,
    );
    expect(calls).toHaveLength(1);
  });

  it('opens the circuit after repeated outages and lets one trial through after the cooldown', async () => {
    let now = 0;
    let calls = 0;
    let down = true;
    const recorded = replay('bali-route-drive');
    const fetch = (input: string | URL, init?: RequestInit) => {
      calls += 1;
      return down ? Promise.resolve(json(502, {})) : recorded.fetch(input, init);
    };
    const breaker = createCircuitBreaker({
      failureThreshold: 2,
      cooldownMs: 1_000,
      now: () => now,
    });
    const valhalla = client(fetch, { retries: 0, breaker });
    const route = () => valhalla.route([P.seminyak, P.ubud], 'auto');

    await expect(route()).rejects.toMatchObject({ kind: 'unavailable' });
    await expect(route()).rejects.toMatchObject({ kind: 'unavailable' });
    await expect(route()).rejects.toMatchObject({ kind: 'circuit_open' });
    expect(calls).toBe(2);

    now = 1_000;
    down = false;
    await expect(route()).resolves.toMatchObject({ legs: [expect.any(Object)] });
    expect(breaker.state).toBe('closed');
    expect(calls).toBe(3);
  });

  it('reports status without throwing', async () => {
    await expect(client(() => Promise.reject(new Error('refused'))).status()).resolves.toBe(false);
    await expect(
      client(() => Promise.resolve(json(200, { version: '3.8.3' }))).status(),
    ).resolves.toBe(true);
  });
});
