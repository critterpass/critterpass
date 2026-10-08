/**
 * `trip_boosts` (C1, RLS T): the crew sees a trip's boosts; a buyer who left keeps seeing theirs. One
 * live boost per trip, and the status machine refuses moves out of a final state.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;

beforeAll(async () => {
  harness = await startStreamHarness();
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

describe('trip_boosts', () => {
  it('keeps one live boost per trip and final states final', async () => {
    const { tripId, crewId, actors } = harness.fixture;
    const promo = () =>
      withSystem(harness.db.pool, (tx) =>
        tx.query<{ id: string }>(
          `INSERT INTO trip_boosts (trip_id, crew_id, source, starts_at, ends_at)
           VALUES ($1, $2, 'promo', now(), now() + interval '9 days') RETURNING id`,
          [tripId, crewId],
        ),
      );
    await expect(promo()).rejects.toThrow(/trip_boosts_live_uk/);
    const status = (to: string) =>
      withSystem(harness.db.pool, (tx) =>
        tx.query(
          `UPDATE trip_boosts SET status = $2,
             revoked_at = CASE WHEN $2 = 'revoked' THEN now() END
           WHERE trip_id = $1 AND source = 'purchase'`,
          [tripId, to],
        ),
      );
    await status('revoked');
    await expect(status('active')).rejects.toThrow(/cannot move from revoked to active/);
    await expect(promo()).resolves.toBeDefined();
    // The buyer reads the boost they paid for even once they are no longer in the crew.
    await withSystem(harness.db.pool, (tx) =>
      tx.query(
        `INSERT INTO trip_boosts (trip_id, crew_id, buyer_id, source, store_transaction_id,
           starts_at, ends_at, status, revoked_at)
         SELECT $1, $2, $3, 'purchase', id, now(), now() + interval '1 day', 'revoked', now()
           FROM store_transactions WHERE transaction_id = 'fixture-otx-1'`,
        [tripId, crewId, actors.exMember],
      ),
    );
    const { rows } = await withUser(harness.db.pool, actors.exMember, randomUUID(), (tx) =>
      tx.query('SELECT buyer_id FROM trip_boosts'),
    );
    expect(rows).toEqual([{ buyer_id: actors.exMember }]);
  });
});
