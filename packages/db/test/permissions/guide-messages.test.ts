/**
 * `guide_messages` (C2) follow their thread: private messages reach the thread owner only, group
 * messages the trip crew, directly and through sync. The guide reads history only through
 * `llm.guide_history`, as `guide_reader`, and sees only the asking user's own thread (or a group
 * thread of their trip). `guide_crew_turns` has no `app_user` grant at all.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withGuideReader, withSystem, withUser } from '../../src/tx';
import { visibleRows } from '../helpers/setup-privacy';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;
let privateThread: string;
let groupThread: string;
let privateMessage: string;
let groupMessage: string;

beforeAll(async () => {
  harness = await startStreamHarness();
  const { rows } = await withSystem(harness.db.pool, (tx) =>
    tx.query<{ id: string; thread_id: string; mode: string }>(
      `SELECT m.id, m.thread_id, t.mode FROM guide_messages m
         JOIN guide_threads t ON t.id = m.thread_id WHERE m.trip_id = $1`,
      [harness.fixture.tripId],
    ),
  );
  const own = rows.find((row) => row.mode === 'private')!;
  const group = rows.find((row) => row.mode === 'group')!;
  [privateThread, privateMessage] = [own.thread_id, own.id];
  [groupThread, groupMessage] = [group.thread_id, group.id];
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

const probe = 'SELECT 1 FROM guide_messages WHERE id = $1';

function history(uid: string, threadId: string): Promise<{ content: string }[]> {
  const { pool } = harness.db;
  return withGuideReader(pool, uid, harness.fixture.tripId, async (tx) => {
    await tx.query("SELECT set_config('app.thread', $1, true)", [threadId]);
    return (await tx.query<{ content: string }>('SELECT content FROM llm.guide_history')).rows;
  });
}

describe('guide_messages', () => {
  it('follows a private thread: owner only, directly and through sync', async () => {
    const { actors } = harness.fixture;
    expect(await visibleRows(harness, actors.organiser, probe, [privateMessage])).toBe(1);
    for (const kind of ['member', 'coOrganiser', 'exMember', 'outsider', 'anonymous'] as const) {
      expect(await visibleRows(harness, actors[kind], probe, [privateMessage]), kind).toBe(0);
    }
    const own = await harness.rows('guide_chat', 'organiser');
    expect(own.get('guide_messages')?.map((row) => row.id)).toEqual([privateMessage]);
    expect((await harness.rows('guide_chat', 'member')).get('guide_messages') ?? []).toEqual([]);
  });

  it('follows a group thread: the trip crew, on the trip stream', async () => {
    const { actors, tripId } = harness.fixture;
    for (const kind of ['member', 'coOrganiser', 'organiser'] as const) {
      expect(await visibleRows(harness, actors[kind], probe, [groupMessage]), kind).toBe(1);
    }
    for (const kind of ['exMember', 'outsider'] as const) {
      expect(await visibleRows(harness, actors[kind], probe, [groupMessage]), kind).toBe(0);
      const synced = await harness.rows('trip', kind, { trip_id: tripId });
      expect(synced.get('guide_messages') ?? [], kind).toHaveLength(0);
    }
    const member = await harness.rows('trip', 'member', { trip_id: tripId });
    expect(member.get('guide_messages')?.map((row) => row.id)).toEqual([groupMessage]);
  });

  it('lets guide_reader read only the calling user’s thread', async () => {
    const { actors } = harness.fixture;
    expect(await history(actors.organiser, privateThread)).toEqual([{ content: 'matrix probe' }]);
    expect(await history(actors.member, privateThread)).toEqual([]);
    expect(await history(actors.member, groupThread)).toEqual([{ content: 'matrix probe' }]);
    expect(await history(actors.outsider, groupThread)).toEqual([]);
    await expect(
      withGuideReader(harness.db.pool, actors.organiser, harness.fixture.tripId, (tx) =>
        tx.query('SELECT 1 FROM guide_messages'),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('is never written by app_user', async () => {
    const { actors } = harness.fixture;
    await expect(
      withUser(harness.db.pool, actors.organiser, randomUUID(), (tx) =>
        tx.query(
          "INSERT INTO guide_messages (thread_id, role, author_id) VALUES ($1, 'user', $2)",
          [privateThread, actors.organiser],
        ),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('keeps guide_crew_turns away from app_user entirely', async () => {
    const { actors } = harness.fixture;
    await expect(
      withUser(harness.db.pool, actors.organiser, randomUUID(), (tx) =>
        tx.query('SELECT 1 FROM guide_crew_turns'),
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});
