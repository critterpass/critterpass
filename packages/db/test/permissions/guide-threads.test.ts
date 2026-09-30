/**
 * `guide_threads` (C2): a private thread is its owner's alone, directly and on the guide_chat
 * stream; a trip's group thread is read by the trip's crew and rides the trip stream. Nobody writes
 * a thread as `app_user` (the guide turn route creates them as app_system), and a user has one
 * private thread per trip and a trip one group thread.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { visibleRows } from '../helpers/setup-privacy';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;
let privateId: string;
let groupId: string;

beforeAll(async () => {
  harness = await startStreamHarness();
  const { rows } = await withSystem(harness.db.pool, (tx) =>
    tx.query<{ id: string; mode: string }>(
      'SELECT id, mode FROM guide_threads WHERE trip_id = $1',
      [harness.fixture.tripId],
    ),
  );
  privateId = rows.find((row) => row.mode === 'private')!.id;
  groupId = rows.find((row) => row.mode === 'group')!.id;
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

const probe = 'SELECT 1 FROM guide_threads WHERE id = $1';

describe('guide_threads', () => {
  it('shows a private thread to its owner only, directly and through sync', async () => {
    const { actors } = harness.fixture;
    expect(await visibleRows(harness, actors.organiser, probe, [privateId])).toBe(1);
    for (const kind of ['member', 'coOrganiser', 'exMember', 'outsider', 'anonymous'] as const) {
      expect(await visibleRows(harness, actors[kind], probe, [privateId]), kind).toBe(0);
    }
    const own = await harness.rows('guide_chat', 'organiser');
    expect(own.get('guide_threads')?.map((row) => row.id)).toEqual([privateId]);
    const other = await harness.rows('guide_chat', 'member');
    expect(other.get('guide_threads') ?? []).toHaveLength(0);
  });

  it('shows a group thread to the trip crew and syncs it on the trip stream', async () => {
    const { actors, tripId } = harness.fixture;
    for (const kind of ['member', 'coOrganiser', 'organiser'] as const) {
      expect(await visibleRows(harness, actors[kind], probe, [groupId]), kind).toBe(1);
    }
    for (const kind of ['exMember', 'outsider', 'anonymous'] as const) {
      expect(await visibleRows(harness, actors[kind], probe, [groupId]), kind).toBe(0);
      const synced = await harness.rows('trip', kind, { trip_id: tripId });
      expect(synced.get('guide_threads') ?? [], kind).toHaveLength(0);
    }
    const member = await harness.rows('trip', 'member', { trip_id: tripId });
    expect(member.get('guide_threads')?.map((row) => row.id)).toEqual([groupId]);
  });

  it('is never written by app_user', async () => {
    const { actors, tripId } = harness.fixture;
    await expect(
      withUser(harness.db.pool, actors.member, randomUUID(), (tx) =>
        tx.query('INSERT INTO guide_threads (user_id, trip_id) VALUES ($1, $2)', [
          actors.member,
          tripId,
        ]),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('keeps one private thread per user and trip, and one group thread per trip', async () => {
    const { actors, tripId, crewId } = harness.fixture;
    await expect(
      withSystem(harness.db.pool, (tx) =>
        tx.query("INSERT INTO guide_threads (user_id, trip_id, mode) VALUES ($1, $2, 'private')", [
          actors.organiser,
          tripId,
        ]),
      ),
    ).rejects.toThrow(/guide_threads_private_key/);
    await expect(
      withSystem(harness.db.pool, (tx) =>
        tx.query(
          "INSERT INTO guide_threads (user_id, trip_id, crew_id, mode) VALUES ($1, $2, $3, 'group')",
          [actors.member, tripId, crewId],
        ),
      ),
    ).rejects.toThrow(/guide_threads_group_key/);
    // The home guide (no trip) is one more private thread, and only one.
    const home = "INSERT INTO guide_threads (user_id, mode) VALUES ($1, 'private')";
    await withSystem(harness.db.pool, (tx) => tx.query(home, [actors.organiser]));
    await expect(
      withSystem(harness.db.pool, (tx) => tx.query(home, [actors.organiser])),
    ).rejects.toThrow(/guide_threads_private_key/);
  });
});
