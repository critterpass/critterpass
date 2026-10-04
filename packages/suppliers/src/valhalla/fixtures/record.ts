/**
 * Records the Valhalla responses the client's contract tests replay (Đà Nẵng, Bali, Kyoto). Runs
 * the real client against a live router, by default the FOSSGIS public instance
 * (valhalla1.openstreetmap.de, same request and response shapes as our 3.8.3 service), and saves
 * each exchange as `<scenario>.json`. About twenty small requests:
 *
 *   pnpm exec tsx packages/suppliers/src/valhalla/fixtures/record.ts [base url] [scenario]
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { createValhallaClient, type ValhallaClient, type ValhallaPoint } from '../client';
import { ValhallaError } from '../errors';

export interface RecordedValhallaExchange {
  readonly path: string;
  readonly request: unknown;
  readonly status: number;
  readonly response: unknown;
}

const BASE_URL = process.argv[2] ?? 'https://valhalla1.openstreetmap.de';

export const PLACES = {
  danangDragonBridge: { lat: 16.0611, lng: 108.2272 },
  danangMyKhe: { lat: 16.0544, lng: 108.247 },
  danangMarbleMountains: { lat: 16.0039, lng: 108.2633 },
  danangHanMarket: { lat: 16.0682, lng: 108.2242 },
  baliSeminyak: { lat: -8.6913, lng: 115.1682 },
  baliUbud: { lat: -8.5188, lng: 115.2585 },
  baliTanahLot: { lat: -8.6212, lng: 115.0868 },
  baliUluwatu: { lat: -8.8291, lng: 115.0849 },
  kyotoStation: { lat: 34.9858, lng: 135.7588 },
  kyotoKiyomizu: { lat: 34.9949, lng: 135.785 },
  kyotoFushimiInari: { lat: 34.9671, lng: 135.7727 },
  kyotoGion: { lat: 35.0037, lng: 135.7788 },
  ubudKomaneka: { lat: -8.5069, lng: 115.2625 },
  ubudSaraswati: { lat: -8.5064, lng: 115.2617 },
  baliTegallalang: { lat: -8.4338, lng: 115.2789 },
  baliTirtaEmpul: { lat: -8.4153, lng: 115.3154 },
  /** Open sea east of Đà Nẵng: no road within reach. */
  southChinaSea: { lat: 15.5, lng: 109.5 },
} satisfies Record<string, ValhallaPoint>;

const p = PLACES;

const SCENARIOS: Record<string, (client: ValhallaClient) => Promise<unknown>> = {
  'danang-route-drive': (c) => c.route([p.danangDragonBridge, p.danangMarbleMountains], 'auto'),
  'bali-route-drive': (c) => c.route([p.baliSeminyak, p.baliUbud], 'auto'),
  'kyoto-route-walk': (c) => c.route([p.kyotoStation, p.kyotoKiyomizu], 'pedestrian'),
  'danang-matrix-walk': (c) =>
    c.matrix(
      [p.danangDragonBridge, p.danangHanMarket],
      [p.danangMyKhe, p.danangMarbleMountains, p.danangHanMarket],
      'pedestrian',
    ),
  'bali-matrix-drive': (c) =>
    c.matrix(
      [p.baliSeminyak, p.baliUbud, p.baliTanahLot, p.baliUluwatu],
      [p.baliSeminyak, p.baliUbud, p.baliTanahLot, p.baliUluwatu],
      'auto',
    ),
  'kyoto-optimized-walk': (c) =>
    c.optimizedRoute(
      [p.kyotoStation, p.kyotoKiyomizu, p.kyotoFushimiInari, p.kyotoGion, p.kyotoStation],
      'pedestrian',
    ),
  'danang-route-off-graph': (c) => c.route([p.southChinaSea, p.danangMyKhe], 'auto'),
  'danang-matrix-off-graph': (c) =>
    c.matrix([p.danangDragonBridge, p.southChinaSea], [p.danangMyKhe], 'auto'),
  'route-over-limit': (c) => c.route([p.danangDragonBridge, p.baliUbud], 'auto'),
  // Fit trying three Kyoto places after the station: one row out, one column back, walk and drive.
  'kyoto-fit-insertions': async (c) => {
    const places = [p.kyotoKiyomizu, p.kyotoFushimiInari, p.kyotoGion];
    for (const costing of ['pedestrian', 'auto'] as const) {
      await c.matrix([p.kyotoStation], places, costing);
      await c.matrix(places, [p.kyotoStation], costing);
    }
  },
  // A planned Ubud day as the legs job asks for it: stay → temple → rice terraces → spring → stay,
  // then the road shapes of the walked hop and of the three drives chained into one route.
  'bali-day-legs': async (c) => {
    const from = [p.ubudKomaneka, p.ubudSaraswati, p.baliTegallalang, p.baliTirtaEmpul];
    const to = [p.ubudSaraswati, p.baliTegallalang, p.baliTirtaEmpul, p.ubudKomaneka];
    await c.matrix(from, to, 'pedestrian');
    await c.matrix(from, to, 'auto');
    await c.route([p.ubudKomaneka, p.ubudSaraswati], 'pedestrian');
    await c.route([p.ubudSaraswati, p.baliTegallalang, p.baliTirtaEmpul, p.ubudKomaneka], 'auto');
  },
};

function recordingFetch(exchanges: RecordedValhallaExchange[]) {
  return async (input: string | URL, init?: RequestInit): Promise<Response> => {
    const response = await fetch(input, init);
    const body: unknown = await response.json();
    exchanges.push({
      path: new URL(input).pathname,
      request: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : null,
      status: response.status,
      response: body,
    });
    return new Response(JSON.stringify(body), { status: response.status });
  };
}

async function main(): Promise<void> {
  const only = process.argv[3];
  for (const [scenario, run] of Object.entries(SCENARIOS)) {
    if (only !== undefined && scenario !== only) continue;
    const exchanges: RecordedValhallaExchange[] = [];
    const client = createValhallaClient({
      baseUrl: BASE_URL,
      fetch: recordingFetch(exchanges),
      routeTimeoutMs: 20_000,
      matrixTimeoutMs: 30_000,
      retries: 0,
    });
    const outcome = await run(client).then(
      () => 'ok',
      (error: unknown) => (error instanceof ValhallaError ? error.kind : String(error)),
    );
    writeFileSync(
      join(import.meta.dirname, `${scenario}.json`),
      `${JSON.stringify(exchanges, null, 2)}\n`,
    );
    console.log(`${scenario}: ${outcome} (${exchanges.length} exchanges)`);
  }
}

if (import.meta.filename === process.argv[1]) await main();
