/**
 * `recap_views` (C2, RLS O): each traveller reads and syncs only their own viewer row on the me
 * stream; nobody writes one through app_user (the builder adds viewers, `record_recap_view` opens).
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withUser } from '../../src/tx';
import { visibleRows } from '../helpers/setup-privacy';
import { idsByTable, startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;

beforeAll(async () => {
  harness = await startStreamHarness();
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

describe('recap_views', () => {
  it('shows each traveller only their own row', async () => {
    const { tripId, actors } = harness.fixture;
    const probe = 'SELECT user_id FROM recap_views WHERE trip_id = $1';
    for (const kind of ['organiser', 'coOrganiser', 'member'] as const) {
      expect(await visibleRows(harness, actors[kind], probe, [tripId]), kind).toBe(1);
    }
    for (const kind of ['outsider', 'exMember', 'anonymous'] as const) {
      expect(await visibleRows(harness, actors[kind], probe, [tripId]), kind).toBe(0);
    }
  });

  it('syncs the own row on the me stream and is never written by app_user', async () => {
    const { actors } = harness.fixture;
    const own = await harness.db.pool.query<{ id: string }>(
      'SELECT id FROM recap_views WHERE user_id = $1',
      [actors.member],
    );
    expect(idsByTable(await harness.rows('me', 'member'))['recap_views']).toEqual(
      own.rows.map((row) => row.id),
    );
    expect(idsByTable(await harness.rows('me', 'outsider'))['recap_views'] ?? []).toEqual([]);
    await expect(
      withUser(harness.db.pool, actors.member, randomUUID(), (tx) =>
        tx.query('UPDATE recap_views SET opened_at = now() WHERE user_id = $1', [actors.member]),
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});
