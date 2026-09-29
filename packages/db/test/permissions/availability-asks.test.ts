/**
 * `availability_asks` (C3, RLS X): the guide's private ask is readable by the member it was sent to
 * and nobody else, the organiser who asked for it included; only the server writes it.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withUser } from '../../src/tx';
import { expectSealed, visibleRows } from '../helpers/setup-privacy';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;

beforeAll(async () => {
  harness = await startStreamHarness();
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

describe('availability_asks', () => {
  it('is readable by its recipient only, and by no role, publication or stream besides', async () => {
    await expectSealed(harness, 'availability_asks', { owner: 'organiser' });
  });

  it('hides the ask from the member who requested it', async () => {
    const { member } = harness.fixture.actors;
    expect(
      await visibleRows(
        harness,
        member,
        'SELECT 1 FROM availability_asks WHERE requested_by = $1',
        [member],
      ),
    ).toBe(0);
  });

  it('refuses every client write', async () => {
    const { organiser, member } = harness.fixture.actors;
    await expect(
      withUser(harness.db.pool, member, randomUUID(), (tx) =>
        tx.query(
          `INSERT INTO availability_asks (trip_id, target_user_id, block_start, block_end, expires_at)
           VALUES ($1, $2, current_date, current_date, now())`,
          [harness.fixture.tripId, organiser],
        ),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      withUser(harness.db.pool, organiser, randomUUID(), (tx) =>
        tx.query("UPDATE availability_asks SET status = 'timed_out'"),
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});
