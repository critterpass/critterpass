/**
 * `briefings` (C2, RLS O): a member's morning briefing is theirs alone, directly and on trip_me;
 * crewmates, the organiser, the guide's reader and outsiders never see it, and nobody writes one as
 * app_user (the briefing job writes as app_system).
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

const probe = 'SELECT 1 FROM briefings WHERE trip_id = $1';

describe('briefings', () => {
  it('shows a briefing to its owner only, directly and through trip_me', async () => {
    const { actors, tripId } = harness.fixture;
    expect(await visibleRows(harness, actors.organiser, probe, [tripId])).toBe(1);
    for (const kind of ['member', 'coOrganiser', 'exMember', 'outsider', 'anonymous'] as const) {
      expect(await visibleRows(harness, actors[kind], probe, [tripId]), kind).toBe(0);
      const synced = await harness.rows('trip_me', kind, { trip_id: tripId });
      expect(synced.get('briefings') ?? [], kind).toHaveLength(0);
    }
    const own = await harness.rows('trip_me', 'organiser', { trip_id: tripId });
    expect(own.get('briefings')).toHaveLength(1);
  });

  it('is closed to the guide reader and granted to replication', async () => {
    const { actors, tripId } = harness.fixture;
    await expect(
      withGuideReader(harness.db.pool, actors.organiser, tripId, (tx) =>
        tx.query('SELECT 1 FROM briefings'),
      ),
    ).rejects.toThrow(/permission denied/i);
    // Replication may read it (the publication and trip_me carry it); RLS still applies to it.
    await expect(
      asRole(harness.db.pool, 'powersync_repl', 'SELECT 1 FROM briefings'),
    ).resolves.toBeDefined();
  });

  it('is never written by app_user', async () => {
    const { actors, tripId } = harness.fixture;
    await expect(
      withUser(harness.db.pool, actors.organiser, randomUUID(), (tx) =>
        tx.query(
          "INSERT INTO briefings (trip_id, user_id, local_date, tz) VALUES ($1, $2, '2026-10-16', 'UTC')",
          [tripId, actors.organiser],
        ),
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});
