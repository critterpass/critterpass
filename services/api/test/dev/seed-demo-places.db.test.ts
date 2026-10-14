/**
 * The demo seed writes its stops straight into the plan, so it refreshes the trip's place cards
 * itself: the phone's plan map pins come from those cards (name and coordinates), and without the
 * refresh the seeded dinner arrived as a bare "Meal" with nowhere to pin it.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerDevRoutes } from '../../src/dev/routes';
import { DEMO_PLACE } from '../../src/dev/demo-plan';
import { startCommandDoors, type CommandDoorsHarness } from '../routes/command-doors-harness';

let harness: CommandDoorsHarness;
const logger = { info: () => undefined, warn: () => undefined };

beforeAll(async () => {
  harness = await startCommandDoors(
    () => undefined,
    (app, deps) => registerDevRoutes(app, { ...deps, appEnv: 'staging', logger }),
  );
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

describe('demo seed place cards', { timeout: 120_000 }, () => {
  it('gives the seeded dinner a place card with its name and coordinates', async () => {
    const caller = await harness.signInAnonymously();
    const seeded = await harness.request('/v1/dev/seed-demo', {
      method: 'POST',
      headers: { cookie: caller.cookie },
      body: JSON.stringify({ scenario: 'everyday' }),
    });
    expect(seeded.status).toBe(200);
    const { trip_id } = (await seeded.json()) as { trip_id: string };
    const { rows } = await harness.pool.query<{ name: string; lat: number; lng: number }>(
      `SELECT tp.name, tp.lat, tp.lng
         FROM trip_places tp JOIN pois p ON p.id = tp.poi_id
        WHERE tp.trip_id = $1 AND p.source_ids ->> 'demo' = $2`,
      [trip_id, DEMO_PLACE.marker],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: DEMO_PLACE.name });
    expect(Number(rows[0]?.lat)).toBeCloseTo(DEMO_PLACE.lat, 4);
    expect(Number(rows[0]?.lng)).toBeCloseTo(DEMO_PLACE.lng, 4);
  });
});
