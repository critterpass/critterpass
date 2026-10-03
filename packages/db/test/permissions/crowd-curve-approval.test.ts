/**
 * An editorial crowd curve reaches no phone until the founder approved it: the trip pack stream
 * and a member's own reads show approved curves and bought ones, never a proposal.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem } from '../../src/tx';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;
let proposed: string;
let approved: string;

beforeAll(async () => {
  harness = await startStreamHarness();
  const { fixture } = harness;
  [proposed, approved] = await withSystem(harness.db.pool, async (tx) => {
    const destination = await tx.query<{ id: string }>(
      "INSERT INTO destinations (slug, name) VALUES ('curve-city', 'Curve City') RETURNING id",
    );
    const dest = destination.rows[0]!.id;
    await tx.query('UPDATE trips SET destination_id = $1 WHERE id = $2', [dest, fixture.tripId]);
    const pois = await tx.query<{ id: string }>(
      `INSERT INTO pois (destination_id, name, category, lat, lng, status, curation)
       VALUES ($1, 'Proposed', 'museum', 1, 1, 'active', 'editorial'),
              ($1, 'Approved', 'museum', 1, 1, 'active', 'editorial')
       RETURNING id`,
      [dest],
    );
    const [first, second] = pois.rows.map((row) => row.id);
    await tx.query(
      `INSERT INTO crowd_forecasts (poi_id, dow, hourly, source, fetched_at, approved_at)
       VALUES ($1, 6, array_fill(40::smallint, ARRAY[24]), 'editorial', now(), NULL),
              ($2, 6, array_fill(40::smallint, ARRAY[24]), 'editorial', now(), now())`,
      [first, second],
    );
    return [first!, second!];
  });
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

describe('editorial crowd curves wait for approval', { timeout: 120_000 }, () => {
  it('the trip pack syncs the approved curve and never the proposal', async () => {
    const rows = await harness.rows('trip_pack', 'member', { trip_id: harness.fixture.tripId });
    const places = (rows.get('crowd_forecasts') ?? []).map((row) => row['poi_id']);
    expect(places).toContain(approved);
    expect(places).not.toContain(proposed);
  });
});
