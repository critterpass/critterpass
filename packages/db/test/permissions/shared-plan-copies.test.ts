/**
 * `shared_plan_copies`: who copied a crew plan into which trip is the copier's own record; the
 * publishing crew sees only the count on its plan.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem } from '../../src/tx';
import { visibleRows } from '../helpers/setup-privacy';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;

beforeAll(async () => {
  harness = await startStreamHarness();
  const { actors, tripId } = harness.fixture;
  await withSystem(harness.db.pool, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO shared_plans (trip_id, destination_id, status)
       SELECT id, (SELECT destination_id FROM pois WHERE name = 'Matrix Probe POI'), 'published'
         FROM trips WHERE id = $1 RETURNING id`,
      [tripId],
    );
    await tx.query(
      'INSERT INTO shared_plan_copies (shared_plan_id, copied_by, trip_id) VALUES ($1, $2, $3)',
      [rows[0]!.id, actors.outsider, tripId],
    );
  });
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

describe('shared_plan_copies', () => {
  it('is read by the copier only', async () => {
    const { actors } = harness.fixture;
    const sql = 'SELECT id FROM shared_plan_copies';
    expect(await visibleRows(harness, actors.outsider, sql)).toBe(1);
    expect(await visibleRows(harness, actors.organiser, sql)).toBe(0);
    expect(await visibleRows(harness, actors.member, sql)).toBe(0);
  });
});
