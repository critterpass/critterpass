/**
 * `queued_guide_questions` (C2): the owner reads their queued question, directly and on the
 * guide_chat stream; only the server writes one; one live question per user per meter day, and a
 * cancelled question frees the day again.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { visibleRows } from '../helpers/setup-privacy';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;
let threadId: string;

beforeAll(async () => {
  harness = await startStreamHarness();
  const { rows } = await withSystem(harness.db.pool, (tx) =>
    tx.query<{ thread_id: string }>(
      'SELECT thread_id FROM queued_guide_questions WHERE user_id = $1',
      [harness.fixture.actors.organiser],
    ),
  );
  threadId = rows[0]!.thread_id;
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

const insert = `INSERT INTO queued_guide_questions (user_id, thread_id, text, tz, queued_for, answer_after)
  VALUES ($1, $2, 'what time is sunrise?', 'Asia/Ho_Chi_Minh', $3, now() + interval '1 hour')
  RETURNING id`;

describe('queued_guide_questions', () => {
  it('is read by its owner only, directly and through sync', async () => {
    const { actors } = harness.fixture;
    const probe = 'SELECT 1 FROM queued_guide_questions WHERE user_id = $1';
    expect(await visibleRows(harness, actors.organiser, probe, [actors.organiser])).toBe(1);
    for (const kind of ['member', 'coOrganiser', 'exMember', 'outsider'] as const) {
      expect(await visibleRows(harness, actors[kind], probe, [actors.organiser]), kind).toBe(0);
    }
    const own = await harness.rows('guide_chat', 'organiser');
    expect(own.get('queued_guide_questions')).toHaveLength(1);
    const other = await harness.rows('guide_chat', 'member');
    expect(other.get('queued_guide_questions') ?? []).toHaveLength(0);
  });

  it('is never written by app_user', async () => {
    const { actors } = harness.fixture;
    await expect(
      withUser(harness.db.pool, actors.organiser, randomUUID(), (tx) =>
        tx.query(insert, [actors.organiser, threadId, '2026-02-01']),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('keeps one live question per user and day; cancelling frees the day', async () => {
    const { actors } = harness.fixture;
    const { pool } = harness.db;
    const first = await withSystem(pool, (tx) =>
      tx.query<{ id: string }>(insert, [actors.organiser, threadId, '2026-03-01']),
    );
    await expect(
      withSystem(pool, (tx) => tx.query(insert, [actors.organiser, threadId, '2026-03-01'])),
    ).rejects.toThrow(/queued_guide_questions_one_per_day_key/);
    await withSystem(pool, (tx) =>
      tx.query("UPDATE queued_guide_questions SET status = 'cancelled' WHERE id = $1", [
        first.rows[0]!.id,
      ]),
    );
    const again = await withSystem(pool, (tx) =>
      tx.query<{ id: string }>(insert, [actors.organiser, threadId, '2026-03-01']),
    );
    expect(again.rows).toHaveLength(1);
  });
});
