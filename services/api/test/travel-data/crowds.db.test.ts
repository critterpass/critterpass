/**
 * `/v1/places/{id}/crowds` and the `crowd_forecast` tool: with no hourly source a place answers
 * `hourly: null` and `best_window: null` beside its destination's reviewed month level; a stored
 * weekly pattern yields the quietest window inside that day's open hours.
 */
import { createToolRegistry } from '@cp/ai';
import { withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { CrowdView } from '../../src/travel-data/crowds-route';
import { registerTravelDataRoutes } from '../../src/travel-data/routes';
import { registerTravelDataToolExecutors } from '../../src/travel-data/tool-executors';
import { startCommandDoors, type CommandDoorsHarness } from '../routes/command-doors-harness';
import { seedLiveDestinations } from './travel-seed';

let harness: CommandDoorsHarness;
let shrine: string;
let market: string;
let guestPlace: string;

/** A hand-built weekday curve (not supplier data): quiet at dawn, busy from mid-morning. */
const PATTERN = [
  4, 3, 2, 2, 3, 6, 10, 18, 35, 60, 80, 92, 95, 97, 94, 88, 76, 60, 45, 32, 22, 14, 9, 6,
];

beforeAll(async () => {
  harness = await startCommandDoors(
    () => undefined,
    (app, deps) => registerTravelDataRoutes(app, deps),
  );
  const destinations = await seedLiveDestinations(harness.pool);
  await withSystem(harness.pool, async (tx) => {
    await tx.query(
      `INSERT INTO season_months (destination_id, month, crowd_index, highlight_tag, colour_role,
         source, sourced_on, reviewed_at)
       SELECT $1, m, CASE WHEN m IN (4, 11) THEN 100 ELSE 50 END,
              CASE m WHEN 4 THEN 'APR BLOSSOMS' WHEN 11 THEN 'NOV LEAVES' END,
              CASE WHEN m IN (4, 11) THEN 'peak' ELSE 'normal' END,
              'Kyoto City Tourism Survey', '2026-09-28', now()
         FROM generate_series(1, 12) AS m`,
      [destinations['kyoto']],
    );
    const poi = async (destination: string | undefined, name: string, hours: object) => {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO pois (destination_id, name, category, lat, lng, hours)
         VALUES ($1, $2, 'temple_shrine', 34.9671, 135.7727, $3) RETURNING id`,
        [destination, name, JSON.stringify(hours)],
      );
      return rows[0]?.id ?? '';
    };
    shrine = await poi(destinations['kyoto'], 'Fushimi Inari Taisha', {
      weekly: { mo: [{ start: '00:00', end: '24:00' }] },
    });
    market = await poi(destinations['kyoto'], 'Nishiki Market', {
      weekly: { mo: [{ start: '09:00', end: '18:00' }] },
    });
    const guest = await tx.query<{ id: string }>(
      "INSERT INTO destinations (slug, name) VALUES ('guest-town', 'Guest Town') RETURNING id",
    );
    guestPlace = await poi(guest.rows[0]?.id, 'Town Square', { weekly: {} });
    await tx.query(
      `INSERT INTO crowd_forecasts (poi_id, dow, hourly, source, fetched_at)
       VALUES ($1, 1, $2, 'besttime', now())`,
      [market, PATTERN],
    );
  });
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

async function crowds(poiId: string, date: string): Promise<{ status: number; body: CrowdView }> {
  const me = await harness.signInAnonymously();
  const response = await harness.request(`/v1/places/${poiId}/crowds?date=${date}`, {
    headers: { cookie: me.cookie },
  });
  return { status: response.status, body: (await response.json()) as CrowdView };
}

describe('GET /v1/places/{id}/crowds', () => {
  it('answers the month level with no hourly data when no source covers the place', async () => {
    const { status, body } = await crowds(shrine, '2027-04-05');
    expect(status).toBe(200);
    expect(body).toMatchObject({
      hourly: null,
      best_window: null,
      source: null,
      month: { month: 4, crowd_index: 100, colour_role: 'peak', highlight_tag: 'APR BLOSSOMS' },
      curve_source: 'Kyoto City Tourism Survey',
    });
    expect(body.curve).toHaveLength(12);
  });

  it('finds the quietest open window from a stored weekly pattern (Monday)', async () => {
    const { body } = await crowds(market, '2027-04-05');
    expect(body.hourly).toEqual(PATTERN);
    expect(body.best_window).toEqual({ start: '16:00', end: '18:00', level: 68 });
  });

  it('has no month level for a destination without a reviewed curve', async () => {
    const { body } = await crowds(guestPlace, '2027-04-05');
    expect(body).toMatchObject({ hourly: null, month: null, curve: null });
  });

  it('rejects unknown places and bad dates', async () => {
    expect((await crowds(crypto.randomUUID(), '2027-04-05')).status).toBe(404);
    expect((await crowds(shrine, '05-04-2027')).status).toBe(422);
  });
});

describe('crowd_forecast tool', () => {
  it('returns the documented shape with nulls instead of invented hours', async () => {
    const registry = createToolRegistry();
    registerTravelDataToolExecutors(registry, harness.pool);
    const me = await harness.signInAnonymously();
    const result = await registry.execute(
      { id: 'c1', name: 'crowd_forecast', input: { poi_id: shrine, date: '2026-11-16' } },
      { uid: me.uid, tripId: null, caller: 'C', route: 'guide.chat' },
    );
    expect(result).toMatchObject({
      ok: true,
      output: {
        hourly: null,
        best_window: null,
        month: { crowd_index: 100, colour_role: 'peak', highlight_tag: 'NOV LEAVES' },
      },
    });
  });
});
