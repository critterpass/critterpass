/**
 * `ideas` (C0, RLS R): the published board is for everyone, through RLS and the help stream; an
 * idea waiting for review is seen by its author alone, on me. Nobody but the server writes, and
 * the embedding and the author never leave the server.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withUser } from '../../src/tx';
import { MATRIX_PENDING_IDEA_TITLE, MATRIX_PUBLIC_IDEA_TITLE } from '../helpers/help-fixture';
import { visibleRows } from '../helpers/setup-privacy';
import { STREAM_ACTORS, startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;

beforeAll(async () => {
  harness = await startStreamHarness();
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

const titles = (rows: readonly Record<string, unknown>[] | undefined) =>
  (rows ?? []).map((row) => row['title']);

describe('ideas', () => {
  it('shows a published idea to everyone and a pending one to its author alone', async () => {
    const { actors } = harness.fixture;
    const probe = 'SELECT 1 FROM ideas WHERE title = $1';
    for (const [kind, uid] of Object.entries(actors)) {
      expect(await visibleRows(harness, uid, probe, [MATRIX_PUBLIC_IDEA_TITLE]), kind).toBe(1);
      expect(await visibleRows(harness, uid, probe, [MATRIX_PENDING_IDEA_TITLE]), kind).toBe(
        kind === 'organiser' ? 1 : 0,
      );
    }
  });

  it('streams a pending idea only to its author on me; the board is read over HTTP', async () => {
    for (const actor of STREAM_ACTORS) {
      const help = titles((await harness.rows('help', actor, { locale: 'en' })).get('ideas'));
      expect(help, actor).toEqual([]);
      const mine = titles((await harness.rows('me', actor)).get('ideas'));
      expect(mine, actor).toEqual(actor === 'organiser' ? [MATRIX_PENDING_IDEA_TITLE] : []);
    }
    const [row] = (await harness.rows('me', 'organiser')).get('ideas') ?? [];
    expect(row?.['title']).toBe(MATRIX_PENDING_IDEA_TITLE);
    expect(row?.['embedding']).toBeUndefined();
    expect(row?.['author_id']).toBeUndefined();
  });

  it('keeps the embedding from every user, and lets no user write', async () => {
    const { organiser } = harness.fixture.actors;
    await expect(
      withUser(harness.db.pool, organiser, randomUUID(), (tx) =>
        tx.query('SELECT embedding FROM ideas'),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      withUser(harness.db.pool, organiser, randomUUID(), (tx) =>
        tx.query("INSERT INTO ideas (title, locale) VALUES ('A brand new idea', 'en')"),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      withUser(harness.db.pool, organiser, randomUUID(), (tx) =>
        tx.query('UPDATE ideas SET votes_count = votes_count + 1'),
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});
