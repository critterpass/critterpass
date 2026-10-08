/**
 * `boost_credits` (C2, RLS M / O): a crew's unspent boosts, visible to its members (and a user's own
 * credit to them); only the server writes, and a boost leaves at most one credit.
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

describe('boost_credits', () => {
  it('leaves at most one credit per boost', async () => {
    await expect(
      withSystem(harness.db.pool, (tx) =>
        tx.query(
          `INSERT INTO boost_credits (crew_id, reason, from_boost_id)
           SELECT crew_id, 'trip_cancelled', from_boost_id FROM boost_credits LIMIT 1`,
        ),
      ),
    ).rejects.toThrow(/boost_credits_from_boost_uk/);
  });
});
