/**
 * `codes` (C2, RLS S): gift and promo codes are checked by the server only, stored as a hash, never
 * synced; a gift code is always funded by a purchase.
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

describe('codes', () => {
  it('refuses a gift code no purchase funded', async () => {
    await expect(
      withSystem(harness.db.pool, (tx) =>
        tx.query(
          `INSERT INTO codes (code_hash, code_prefix, kind, grant_spec)
           VALUES ($1, 'PASS', 'gift', '{}')`,
          ['d'.repeat(64)],
        ),
      ),
    ).rejects.toThrow(/check/i);
  });
});
