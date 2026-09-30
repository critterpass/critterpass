/**
 * `briefing_items` (C2, RLS O): the items of a member's briefing follow it, readable by that member
 * alone and synced on their trip_me; nobody acts on an item by writing it as app_user (the
 * `act_briefing_item` command writes after its own check), and the guide's reader never sees one.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withGuideReader, withUser } from '../../src/tx';
import { asRole, visibleRows } from '../helpers/setup-privacy';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;

beforeAll(async () => {
  harness = await startStreamHarness();
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

const probe = 'SELECT 1 FROM briefing_items WHERE trip_id = $1';

describe('briefing_items', () => {
  it('shows an item to the briefing owner only, directly and through trip_me', async () => {
    const { actors, tripId } = harness.fixture;
    expect(await visibleRows(harness, actors.organiser, probe, [tripId])).toBe(1);
    for (const kind of ['member', 'coOrganiser', 'exMember', 'outsider', 'anonymous'] as const) {
      expect(await visibleRows(harness, actors[kind], probe, [tripId]), kind).toBe(0);
      const synced = await harness.rows('trip_me', kind, { trip_id: tripId });
      expect(synced.get('briefing_items') ?? [], kind).toHaveLength(0);
    }
    const own = await harness.rows('trip_me', 'organiser', { trip_id: tripId });
    expect(own.get('briefing_items')).toHaveLength(1);
  });

  it('is closed to the guide reader and granted to replication', async () => {
    const { actors, tripId } = harness.fixture;
    await expect(
      withGuideReader(harness.db.pool, actors.organiser, tripId, (tx) =>
        tx.query('SELECT 1 FROM briefing_items'),
      ),
    ).rejects.toThrow(/permission denied/i);
    // Replication may read it (the publication and trip_me carry it); RLS still applies to it.
    await expect(
      asRole(harness.db.pool, 'powersync_repl', 'SELECT 1 FROM briefing_items'),
    ).resolves.toBeDefined();
  });

  it('is never updated by app_user, not even by its owner', async () => {
    const { actors, tripId } = harness.fixture;
    await expect(
      withUser(harness.db.pool, actors.organiser, randomUUID(), (tx) =>
        tx.query("UPDATE briefing_items SET status = 'done' WHERE trip_id = $1", [tripId]),
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});
