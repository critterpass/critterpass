/**
 * `private_guide_threads` (C3, RLS X): a recipient's private reason. Only its owner reads it; the
 * organiser, peers, guide_reader and replication never do, and it is in no publication or stream.
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

describe('private_guide_threads', () => {
  it('is read by its owner alone and sealed from guide_reader, replication and streams', async () => {
    await expectSealed(harness, 'private_guide_threads', { owner: 'member' });
  });

  it("keeps the member's reason from both organisers", async () => {
    const { actors, tripId } = harness.fixture;
    const probe = 'SELECT reason FROM private_guide_threads WHERE trip_id = $1';
    expect(await visibleRows(harness, actors.organiser, probe, [tripId])).toBe(0);
    expect(await visibleRows(harness, actors.coOrganiser, probe, [tripId])).toBe(0);
  });

  it('is not writable by its owner through app_user', async () => {
    const { actors } = harness.fixture;
    await expect(
      withUser(harness.db.pool, actors.member, randomUUID(), (tx) =>
        tx.query("UPDATE private_guide_threads SET reason = 'plan' WHERE owner_id = $1", [
          actors.member,
        ]),
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});
