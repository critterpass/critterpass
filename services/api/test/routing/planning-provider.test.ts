/**
 * Planning travel: routed minutes from recorded Valhalla answers, straight-line "about" minutes
 * whenever the router can't answer (unset, down, a stop off the road graph), the walk / car /
 * driver rule with the destination's drive factor, and the guarantee that nothing a planning
 * module stores can come from Mapbox (type-level and in the source).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import type { RouteEtaResult } from '@cp/domain';
import {
  chooseLegMode,
  createPlanningTravel,
  createValhallaClient,
  type PlanningTravelResult,
  type ValhallaPoint,
} from '@cp/suppliers';
import { describe, expect, it } from 'vitest';

import {
  jsonResponse,
  loadValhallaScenario,
  replayValhalla,
} from '../../../../packages/suppliers/src/valhalla/fixtures/replay';

const P = {
  dragonBridge: { lat: 16.0611, lng: 108.2272 },
  myKhe: { lat: 16.0544, lng: 108.247 },
  marble: { lat: 16.0039, lng: 108.2633 },
  hanMarket: { lat: 16.0682, lng: 108.2242 },
  sea: { lat: 15.5, lng: 109.5 },
} satisfies Record<string, ValhallaPoint>;

function travelOver(fetch: (input: string | URL, init?: RequestInit) => Promise<Response>) {
  const errors: unknown[] = [];
  const travel = createPlanningTravel({
    valhalla: createValhallaClient({ baseUrl: 'http://valhalla.test:8002', fetch, retries: 0 }),
    onError: (error) => errors.push(error),
  });
  return { travel, errors };
}

const leg = (minutes: number, meters: number, approx = false): PlanningTravelResult => ({
  minutes,
  meters,
  source: approx ? 'straight_line' : 'valhalla',
  approx,
  storable: true,
});

describe('planning travel', () => {
  it('stores Valhalla minutes for every pair of a day', async () => {
    const recorded = loadValhallaScenario('danang-matrix-walk')[0]?.response as {
      sources_to_targets: { time: number }[][];
    };
    const { travel } = travelOver(replayValhalla('danang-matrix-walk').fetch);
    const cells = await travel.matrix(
      [P.dragonBridge, P.hanMarket],
      [P.myKhe, P.marble, P.hanMarket],
      'walk',
    );
    expect(cells[0]?.[1]).toMatchObject({ source: 'valhalla', approx: false, storable: true });
    expect(cells[0]?.[1]?.minutes).toBe(
      Math.round((recorded.sources_to_targets[0]?.[1]?.time ?? 0) / 60),
    );
    expect(cells[1]?.[2]).toMatchObject({ minutes: 0, meters: 0, approx: false });
  });

  it('marks only the stop off the road graph as about', async () => {
    const { travel } = travelOver(replayValhalla('danang-matrix-off-graph').fetch);
    const [fromBridge, fromSea] = await travel.matrix([P.dragonBridge, P.sea], [P.myKhe], 'drive');
    expect(fromBridge?.[0]).toMatchObject({ source: 'valhalla', approx: false });
    expect(fromSea?.[0]).toMatchObject({ source: 'straight_line', approx: true, storable: true });
    expect(fromSea?.[0]?.minutes).toBeGreaterThan(60);
  });

  it('answers about-minutes when the router is down or not configured', async () => {
    const { travel, errors } = travelOver(() => Promise.resolve(jsonResponse(503, {})));
    const down = await travel.travel(P.dragonBridge, P.marble, 'drive');
    expect(down).toMatchObject({ source: 'straight_line', approx: true });
    expect(errors).toHaveLength(1);

    const unset = createPlanningTravel({ valhalla: null });
    expect(await unset.travel(P.dragonBridge, P.marble, 'drive')).toEqual(down);
    expect(await unset.travel(P.myKhe, P.myKhe, 'walk')).toMatchObject({ minutes: 0, meters: 0 });
  });
});

describe('chooseLegMode', () => {
  const base = { driverAssigned: false, driveFactor: 1 };

  it('walks a short leg, drives a long one with the drive factor', () => {
    expect(chooseLegMode({ ...base, walk: leg(12, 900), drive: leg(4, 1100) })).toMatchObject({
      mode: 'walk',
      minutes: 12,
    });
    expect(chooseLegMode({ ...base, walk: leg(16, 1100), drive: leg(5, 1300) }).mode).toBe('drive');
    expect(
      chooseLegMode({ ...base, driveFactor: 1.3, walk: leg(40, 3000), drive: leg(70, 30_000) }),
    ).toMatchObject({ mode: 'drive', minutes: 91, meters: 30_000 });
  });

  it('goes with the crew’s driver when one drives that day, keeping about-minutes about', () => {
    expect(
      chooseLegMode({
        driverAssigned: true,
        driveFactor: 1,
        walk: leg(90, 7000, true),
        drive: leg(20, 9000, true),
      }),
    ).toEqual({ mode: 'driver', minutes: 20, meters: 9000, source: 'straight_line', approx: true });
  });
});

describe('no Navigation API result is stored', () => {
  it('has no Mapbox source in the planning result type', () => {
    const mapbox = { source: 'mapbox' } as const satisfies Pick<RouteEtaResult, 'source'>;
    // @ts-expect-error a Mapbox source can never be a planning (storable) result
    const stored: Pick<PlanningTravelResult, 'source'> = mapbox;
    expect(stored.source).toBe('mapbox');
  });

  it('keeps every module that touches stored travel away from the Mapbox clients', () => {
    const root = join(import.meta.dirname, '../../../..');
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (name === 'node_modules' || name === 'fixtures') return [];
        return statSync(path).isDirectory() ? walk(path) : path.endsWith('.ts') ? [path] : [];
      });
    const files = ['services/api/src', 'services/worker/src', 'packages/suppliers/src'].flatMap(
      (dir) => walk(join(root, dir)),
    );
    const storing = files.filter((file) =>
      /route_cache|plan_legs|createPlanningTravel|planning-provider/.test(
        readFileSync(file, 'utf8'),
      ),
    );
    expect(storing.length).toBeGreaterThan(3);
    const offenders = storing.filter((file) =>
      /from '[^']*(mapbox|routing\/eta)[^']*'|api\.mapbox\.com|createMapboxRoutingProvider/.test(
        readFileSync(file, 'utf8'),
      ),
    );
    expect(offenders).toEqual([]);
  });
});
