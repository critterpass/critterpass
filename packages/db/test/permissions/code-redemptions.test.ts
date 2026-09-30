/**
 * `code_redemptions` (C2, RLS O): a user reads and syncs their own redemptions; a code redeems once
 * per user.
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

describe('code_redemptions', () => {
  it('is owner-only, read-only and synced on me', async () => {
    await expectOwnerOnlyTable(harness, 'code_redemptions');
  });

  it('redeems a code once per user', async () => {
    await expect(
      withSystem(harness.db.pool, (tx) =>
        tx.query(
          `INSERT INTO code_redemptions (code_id, user_id, applied_as, starts_at, new_period_end)
           SELECT code_id, user_id, 'server_grant', now(), now() + interval '1 day'
             FROM code_redemptions LIMIT 1`,
        ),
      ),
    ).rejects.toThrow(/duplicate key/);
  });
});
