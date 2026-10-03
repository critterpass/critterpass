/**
 * `route_cache` (C4, RLS X): drive and walk minutes the server reuses across jobs. No app_user
 * grant at all, so no person reads or writes it through the request role; it is in no publication,
 * no stream and no guide view; the server reads and writes it.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { expectSealed } from '../helpers/setup-privacy';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;

beforeAll(async () => {
  harness = await startStreamHarness();
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

describe('route_cache', () => {
  it('is sealed from every person, the guide, replication and every stream', async () => {
    await expectSealed(harness, 'route_cache', { owner: null });
  });

  it('refuses app_user writes and serves the server', async () => {
    await expect(
      withUser(harness.db.pool, harness.fixture.actors.organiser, randomUUID(), (tx) =>
        tx.query(
          "INSERT INTO route_cache (key, minutes, meters, source) VALUES ('k', 1, 1, 'valhalla')",
        ),
      ),
    ).rejects.toThrow(/permission denied/i);
    const minutes = await withSystem(harness.db.pool, async (tx) => {
      await tx.query(
        `INSERT INTO route_cache (key, minutes, meters, source) VALUES ('matrix-probe', 30, 15000, 'valhalla')
         ON CONFLICT (key) DO UPDATE SET minutes = EXCLUDED.minutes, computed_at = now()`,
      );
      const { rows } = await tx.query<{ minutes: number }>(
        "SELECT minutes FROM route_cache WHERE key = 'matrix-probe'",
      );
      return rows[0]?.minutes;
    });
    expect(minutes).toBe(30);
  });
});
