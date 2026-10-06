/**
 * Developer tools, staging only: asks the api for the crew live map scenario
 * (`POST /v1/dev/seed-live-map`: a new crew this account organises with a boosted and an unboosted
 * trip that are on) and waits until both trips have synced. The device run hands the answer to its
 * runner, which brings simulated crewmates in with the crew code (e2e/crew/live-map/).
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer: a route path, SQL and
   developer-facing errors, never copy. */
import type { AbstractPowerSyncDatabase } from '@powersync/common';

export interface SeedLiveMapDeps {
  readonly baseUrl: string;
  readonly sessionHeaders: () => Promise<Record<string, string>>;
  readonly db: Pick<AbstractPowerSyncDatabase, 'getAll'>;
  readonly fetch?: typeof fetch;
  readonly syncTimeoutMs?: number;
  readonly pollMs?: number;
}

export interface SeededLiveMap {
  readonly code: string;
  readonly tripId: string;
  readonly unboostedTripId: string;
  readonly poiId: string;
  readonly synced: boolean;
}

interface SeedLiveMapResponse {
  readonly code: string;
  readonly trip_id: string;
  readonly unboosted_trip_id: string;
  readonly poi_id: string;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function seedLiveMap(deps: SeedLiveMapDeps): Promise<SeededLiveMap> {
  const request = deps.fetch ?? fetch;
  const response = await request(new URL('/v1/dev/seed-live-map', deps.baseUrl).href, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await deps.sessionHeaders()) },
    body: '{}',
  });
  if (!response.ok) throw new Error(`seed-live-map failed: HTTP ${response.status}`);
  const seeded = (await response.json()) as SeedLiveMapResponse;
  const ids = [seeded.trip_id, seeded.unboosted_trip_id];
  const arrived = async () =>
    (await deps.db.getAll<{ id: string }>('SELECT id FROM trips WHERE id IN (?, ?)', ids))
      .length === ids.length;
  const deadline = Date.now() + (deps.syncTimeoutMs ?? 90_000);
  let synced = await arrived();
  while (!synced && Date.now() < deadline) {
    await wait(deps.pollMs ?? 500);
    synced = await arrived();
  }
  return {
    code: seeded.code,
    tripId: seeded.trip_id,
    unboostedTripId: seeded.unboosted_trip_id,
    poiId: seeded.poi_id,
    synced,
  };
}
