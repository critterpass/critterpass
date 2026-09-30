/**
 * `subscriptions` (C2, RLS O): the owner reads and syncs their own subscriptions; only the server
 * writes them, one row per store original transaction.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem } from '../../src/tx';
import { expectOwnerOnlyTable } from '../helpers/billing-fixture';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;

beforeAll(async () => {
  harness = await startStreamHarness();
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

describe('subscriptions', () => {
  it('is owner-only, read-only and synced on me', async () => {
    await expectOwnerOnlyTable(harness, 'subscriptions');
  });

  it('keeps one row per store product and account, naming its transaction for store rows only', async () => {
    const { organiser } = harness.fixture.actors;
    const insert = (platform: string, otx: string | null, product = 'pass_monthly') =>
      withSystem(harness.db.pool, (tx) =>
        tx.query(
          `INSERT INTO subscriptions (user_id, platform, original_transaction_id, product_key, status)
           VALUES ($1, $2, $3, $4, 'active')`,
          [organiser, platform, otx, product],
        ),
      );
    await expect(insert('app_store', 'fixture-otx-2')).rejects.toThrow(/subscriptions_store_uk/);
    await expect(insert('app_store', 'fixture-otx-2', 'pass_yearly')).resolves.toBeDefined();
    await expect(insert('promo', 'fixture-otx-3')).rejects.toThrow(/check/i);
    await expect(insert('promo', null)).resolves.toBeDefined();
  });
});
