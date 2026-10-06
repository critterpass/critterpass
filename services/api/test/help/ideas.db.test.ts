/**
 * The idea board's per-traveller reads: crewmates' votes name only people sharing an active crew
 * with the caller (never a stranger, never a former member), and a new suggestion finds the public
 * idea it sounds like while unrelated, closed or unreviewed ideas stay out.
 */
import { withUser } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { similarIdeas } from '../../src/routes/ideas';
import type { AccountHarness, Session } from '../account/account-harness';
import { startHelpHarness } from './help-harness';

let h: AccountHarness;
let me: Session;
let maya: Session;
let left: Session;
let stranger: Session;
const ids: Record<string, string> = {};

beforeAll(async () => {
  h = await startHelpHarness();
  [me, maya, left, stranger] = await Promise.all([
    h.anonymous(),
    h.anonymous(),
    h.anonymous(),
    h.anonymous(),
  ]);
  const [crew] = await h.rows<{ id: string }>(
    "INSERT INTO crews (name, created_by) VALUES ('Board', $1) RETURNING id",
    [me.uid],
  );
  await h.rows(
    `INSERT INTO crew_members (crew_id, user_id, role, status)
     VALUES ($1, $2, 'organiser', 'active'), ($1, $3, 'member', 'active'), ($1, $4, 'member', 'left')`,
    [crew!.id, me.uid, maya.uid, left.uid],
  );
  const ideas = await h.rows<{ id: string; title: string }>(
    `INSERT INTO ideas (title, locale, status, votes_count, author_id)
     VALUES ('Packing lists per crew', 'en', 'planned', 412, NULL),
            ('Split receipts by item', 'en', 'building', 356, NULL),
            ('Offline voice for the guide', 'en', 'open', 198, NULL),
            ('Packing reminders on the watch', 'en', 'shipped', 40, NULL),
            ('Shared packing list for my crew', 'en', 'pending_review', 0, $1)
     RETURNING id, title`,
    [stranger.uid],
  );
  for (const idea of ideas) ids[idea.title] = idea.id;
  await h.rows(
    `INSERT INTO idea_votes (idea_id, user_id, month_key)
     VALUES ($1, $3, '2026-10'), ($1, $4, '2026-10'), ($1, $5, '2026-10'),
            ($2, $3, '2026-10'), ($1, $6, '2026-10')`,
    [
      ids['Packing lists per crew'],
      ids['Split receipts by item'],
      maya.uid,
      left.uid,
      stranger.uid,
      me.uid,
    ],
  );
}, 240_000);

afterAll(async () => {
  await h?.stop();
});

describe('GET /v1/ideas/crewmates', () => {
  it('names only active crewmates, never the caller, a former member or a stranger', async () => {
    const [status, body] = await h.get(me, '/v1/ideas/crewmates');
    expect(status).toBe(200);
    const votes = body['votes'] as { idea_id: string; user_id: string }[];
    expect(votes).toHaveLength(2);
    expect(new Set(votes.map((v) => v.user_id))).toEqual(new Set([maya.uid]));
    expect(new Set(votes.map((v) => v.idea_id))).toEqual(
      new Set([ids['Packing lists per crew'], ids['Split receipts by item']]),
    );
  });

  it('is empty for someone with no crew', async () => {
    const [, body] = await h.get(stranger, '/v1/ideas/crewmates');
    expect(body['votes']).toEqual([]);
  });
});

describe('similar ideas', () => {
  const similar = (text: string) =>
    withUser(h.pool, me.uid, 'unknown', (tx) => similarIdeas(tx, text));

  it('finds the open idea a suggestion sounds like, and nothing closed or in review', async () => {
    const found = await similar('Shared packing list');
    expect(found[0]?.title).toBe('Packing lists per crew');
    const titles = found.map((idea) => idea.title);
    expect(titles).not.toContain('Packing reminders on the watch');
    expect(titles).not.toContain('Shared packing list for my crew');
  });

  it('folds accents and case', async () => {
    const found = await similar('SPLÌT RECEIPTS');
    expect(found[0]?.title).toBe('Split receipts by item');
  });

  it('answers nothing for an unrelated suggestion', async () => {
    expect(await similar('Dark mode for the wallet')).toEqual([]);
  });
});
