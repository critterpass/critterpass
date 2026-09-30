/**
 * `phrase_progress` (C2, self): the owner records and reads their own practice, directly and on
 * the `me` stream, and can never write a row for someone else. `custom_phrase_cards` (C2) are
 * read by their owner only and written by the server alone.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withUser } from '../../src/tx';
import { visibleRows } from '../helpers/setup-privacy';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;

beforeAll(async () => {
  harness = await startStreamHarness();
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

const as = (uid: string, sql: string, params: unknown[] = []) =>
  withUser(harness.db.pool, uid, randomUUID(), (tx) => tx.query(sql, params));

describe('phrase_progress', () => {
  it('is written and read by its owner, and synced on me', async () => {
    const { actors } = harness.fixture;
    const phraseId = randomUUID();
    await as(
      actors.member,
      'INSERT INTO phrase_progress (user_id, phrase_id, attempts, score, practised_at) VALUES ($1, $2, 1, 80, now())',
      [actors.member, phraseId],
    );
    await as(actors.member, 'UPDATE phrase_progress SET attempts = 2 WHERE phrase_id = $1', [
      phraseId,
    ]);
    const probe = 'SELECT 1 FROM phrase_progress WHERE phrase_id = $1 AND attempts = 2';
    expect(await visibleRows(harness, actors.member, probe, [phraseId])).toBe(1);
    expect(await visibleRows(harness, actors.organiser, probe, [phraseId])).toBe(0);
    const synced = await harness.rows('me', 'member');
    expect(synced.get('phrase_progress')?.map((row) => row.phrase_id)).toContain(phraseId);
  });

  it('never takes a row for another user', async () => {
    const { actors } = harness.fixture;
    await expect(
      as(actors.member, 'INSERT INTO phrase_progress (user_id, phrase_id) VALUES ($1, $2)', [
        actors.organiser,
        randomUUID(),
      ]),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe('custom_phrase_cards', () => {
  it('is read by its owner only, directly and through sync', async () => {
    const { actors } = harness.fixture;
    const probe = 'SELECT 1 FROM custom_phrase_cards WHERE user_id = $1';
    expect(await visibleRows(harness, actors.organiser, probe, [actors.organiser])).toBe(1);
    for (const kind of ['member', 'coOrganiser', 'outsider'] as const) {
      expect(await visibleRows(harness, actors[kind], probe, [actors.organiser]), kind).toBe(0);
    }
    const own = await harness.rows('guide_chat', 'organiser');
    expect(own.get('custom_phrase_cards')).toHaveLength(1);
  });

  it('is never written by app_user', async () => {
    const { actors, tripId } = harness.fixture;
    await expect(
      as(
        actors.organiser,
        "INSERT INTO custom_phrase_cards (user_id, trip_id, purpose, language, register) VALUES ($1, $2, 'x', 'vi', 'polite')",
        [actors.organiser, tripId],
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});
