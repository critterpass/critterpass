/**
 * `store_transactions` (C5, RLS S): the accounting record of every store transaction. Nobody but
 * the server reads it, it never syncs, and a transaction is recorded once per platform.
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

describe('store_transactions', () => {
  it('records a store transaction once per platform', async () => {
    await expect(
      withSystem(harness.db.pool, (tx) =>
        tx.query(
          `INSERT INTO store_transactions (platform, transaction_id, product_key, store_product_id,
             purchased_at) VALUES ('app_store', 'fixture-boost-1', 'boost_trip', 'boost_trip', now())`,
        ),
      ),
    ).rejects.toThrow(/duplicate key/);
  });
});
