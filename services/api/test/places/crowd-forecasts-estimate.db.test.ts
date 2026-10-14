/**
 * A popular place's AI-estimated busy curves on the crowd route: sent for a weekday only when no
 * crew-seen, approved editorial or bought curve covers it, and always labelled `estimate`.
 */
import { withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { PlaceCrowdForecasts } from '../../src/routes/place-crowd-forecasts';
import { registerSharedContentRoutes } from '../../src/routes/shared-content';
import {
  startCommandDoors,
  type CommandDoorsHarness,
  type SignedIn,
} from '../routes/command-doors-harness';

let harness: CommandDoorsHarness;
let me: SignedIn;
let market: string;

const CURVE = Array.from({ length: 24 }, (_, hour) => (hour * 4) % 100);

beforeAll(async () => {
  harness = await startCommandDoors(
    () => undefined,
    (app, deps) => registerSharedContentRoutes(app, deps),
  );
  me = await harness.signInAnonymously();
  await withSystem(harness.pool, async (tx) => {
    const destination = await tx.query<{ id: string }>(
      `INSERT INTO destinations (slug, name, country, coverage, tz)
       VALUES ('vn-hoi-an-crowds', 'Hội An', 'VN', 'guest', 'Asia/Ho_Chi_Minh') RETURNING id`,
    );
    const poi = await tx.query<{ id: string }>(
      `INSERT INTO pois (destination_id, name, category, lat, lng, editorial)
       VALUES ($1, 'Hội An Central Market', 'market', 15.877, 108.33, '{"must_see": true}')
       RETURNING id`,
      [destination.rows[0]?.id],
    );
    market = poi.rows[0]?.id ?? '';
    // Sunday: crews saw it. Monday: an approved editorial week. Tuesday: an unapproved one.
    // Wednesday: a bought forecast. Every day: the estimate.
    await tx.query(
      `INSERT INTO crowd_forecasts (poi_id, dow, hourly, source, fetched_at, approved_at, crew_count)
       VALUES ($1, 0, $2, 'visits', now(), NULL, 6),
              ($1, 1, $2, 'editorial', now(), now(), NULL),
              ($1, 2, $2, 'editorial', now(), NULL, NULL),
              ($1, 3, $2, 'besttime', now(), NULL, NULL)`,
      [market, CURVE],
    );
    await tx.query(
      `INSERT INTO crowd_forecasts (poi_id, dow, hourly, source, fetched_at)
       SELECT $1, dow, $2, 'estimate', now() FROM generate_series(0, 6) AS dow`,
      [market, CURVE],
    );
  });
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

describe('GET /v1/places/{id}/crowd-forecasts with estimates', () => {
  it('sends the estimate only on days nothing better covers', async () => {
    const response = await harness.request(`/v1/places/${market}/crowd-forecasts`, {
      headers: { cookie: me.cookie },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as PlaceCrowdForecasts;
    expect(body.curves.map((curve) => [curve.dow, curve.source])).toEqual([
      [0, 'visits'],
      [1, 'editorial'],
      [2, 'estimate'],
      [3, 'besttime'],
      [4, 'estimate'],
      [5, 'estimate'],
      [6, 'estimate'],
    ]);
  });
});
