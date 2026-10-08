/**
 * `boost_intents` (C1, RLS T): the crew sees who is buying a boost for a trip; only the server writes,
 * and a trip holds at most one open or purchasing intent at a time.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem } from '../../src/tx';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;

beforeAll(async () => {
  harness = await startStreamHarness();
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

describe('boost_intents', () => {
  it('holds one lock per trip until it closes', async () => {
    const { tripId, crewId, actors } = harness.fixture;
    const open = (buyer: string) =>
      withSystem(harness.db.pool, (tx) =>
        tx.query<{ id: string }>(
          `INSERT INTO boost_intents (trip_id, crew_id, buyer_id, product_key, split_mode, expires_at)
           VALUES ($1, $2, $3, 'boost_trip', 'cover', now() + interval '15 minutes') RETURNING id`,
          [tripId, crewId, buyer],
        ),
      );
    const first = await open(actors.member);
    await expect(open(actors.organiser)).rejects.toThrow(/boost_intents_trip_lock_uk/);
    await withSystem(harness.db.pool, (tx) =>
      tx.query("UPDATE boost_intents SET status = 'expired' WHERE id = $1", [first.rows[0]!.id]),
    );
    await expect(open(actors.organiser)).resolves.toBeDefined();
  });
});
