/**
 * Home, inbox, nudge and tip permissions: `home_tips` (crew read, system write), `nudges` (sender
 * and target read, system write), `app_open_hours` (owner only, never synced, never readable by
 * the guide), `saved_items` and `reminders` (owner), the inbox's read marker and resolver, and the
 * `me` / `crews` stream queries that carry them.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withGuideReader, withSystem, withUser } from '../../src/tx';
import { insertUser } from '../helpers/actors';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;
let dismissedTipId: string;
let inboxItemId: string;

function as<T extends object = Record<string, unknown>>(
  uid: string,
  sql: string,
  params: unknown[] = [],
) {
  return withUser(harness.db.pool, uid, randomUUID(), (tx) => tx.query<T>(sql, params));
}

function asSystem<T extends object = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  return withSystem(harness.db.pool, (tx) => tx.query<T>(sql, params));
}

async function count(uid: string, sql: string, params: unknown[] = []): Promise<number> {
  const { rows } = await as<{ n: string }>(uid, `SELECT count(*) AS n FROM ${sql}`, params);
  return Number(rows[0]?.n ?? 0);
}

beforeAll(async () => {
  harness = await startStreamHarness();
  const { crewId, actors } = harness.fixture;
  const { rows } = await asSystem<{ id: string }>(
    `INSERT INTO home_tips (crew_id, kind, text, facts, dedupe_key, valid_until, status)
     VALUES ($1, 'fare_drop', 'Old tip', '{}', 'dismissed-probe', now() + interval '1 day', 'dismissed')
     RETURNING id`,
    [crewId],
  );
  dismissedTipId = rows[0]!.id;
  const inbox = await asSystem<{ id: string }>(
    `INSERT INTO inbox_items (user_id, kind, needs_you, resolve_key)
     VALUES ($1, 'nudge.received', true, 'probe:1') RETURNING id`,
    [actors.member],
  );
  inboxItemId = inbox.rows[0]!.id;
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

describe('home_tips', () => {
  it('shows a crew tip to active members only', async () => {
    const { crewId, actors } = harness.fixture;
    const sql = 'home_tips WHERE crew_id = $1';
    expect(await count(actors.member, sql, [crewId])).toBe(2);
    expect(await count(actors.organiser, sql, [crewId])).toBe(2);
    expect(await count(actors.outsider, sql, [crewId])).toBe(0);
    expect(await count(actors.exMember, sql, [crewId])).toBe(0);
  });

  it('refuses client writes', async () => {
    const { crewId, actors } = harness.fixture;
    await expect(
      as(
        actors.member,
        `INSERT INTO home_tips (crew_id, kind, text, facts, dedupe_key, valid_until)
         VALUES ($1, 'fare_drop', 'x', '{}', 'x', now())`,
        [crewId],
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      as(actors.member, "UPDATE home_tips SET status = 'dismissed' WHERE crew_id = $1", [crewId]),
    ).rejects.toThrow(/permission denied/i);
  });

  it('syncs only active tips of active crews', async () => {
    const member = await harness.rows('crews', 'member');
    const ids = (member.get('home_tips') ?? []).map((row) => row['id']);
    expect(ids).toHaveLength(1);
    expect(ids).not.toContain(dismissedTipId);
    for (const actor of ['outsider', 'exMember', 'anonymous'] as const) {
      expect((await harness.rows('crews', actor)).get('home_tips') ?? [], actor).toEqual([]);
    }
  });
});

describe('nudges', () => {
  it('is visible to its sender and target only', async () => {
    const { actors } = harness.fixture;
    const sql = 'nudges WHERE sender_id = $1';
    expect(await count(actors.organiser, sql, [actors.organiser])).toBe(1);
    expect(await count(actors.member, sql, [actors.organiser])).toBe(1);
    expect(await count(actors.coOrganiser, sql, [actors.organiser])).toBe(0);
    expect(await count(actors.outsider, sql, [actors.organiser])).toBe(0);
  });

  it('refuses client inserts: nudges go through send_nudge', async () => {
    const { crewId, actors } = harness.fixture;
    await expect(
      as(
        actors.organiser,
        `INSERT INTO nudges (sender_id, target_id, crew_id, reason, channel)
         VALUES ($1, $2, $3, 'vote', 'push')`,
        [actors.organiser, actors.coOrganiser, crewId],
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('syncs to the sender and the target through `me`', async () => {
    for (const actor of ['organiser', 'member'] as const) {
      expect((await harness.rows('me', actor)).get('nudges') ?? [], actor).toHaveLength(1);
    }
    for (const actor of ['outsider', 'exMember', 'anonymous'] as const) {
      expect((await harness.rows('me', actor)).get('nudges') ?? [], actor).toEqual([]);
    }
  });
});

describe('app_open_hours', () => {
  it('is private to its owner', async () => {
    const { actors } = harness.fixture;
    expect(
      await count(actors.organiser, 'app_open_hours WHERE user_id = $1', [actors.organiser]),
    ).toBe(1);
    expect(
      await count(actors.member, 'app_open_hours WHERE user_id = $1', [actors.organiser]),
    ).toBe(0);
    await expect(
      as(
        actors.member,
        'INSERT INTO app_open_hours (user_id, hour_local, opens) VALUES ($1, 9, 1)',
        [actors.organiser],
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('lets the owner count their own opens', async () => {
    const owner = await withSystem(harness.db.pool, (tx) => insertUser(tx));
    await as(
      owner,
      `INSERT INTO app_open_hours (user_id, hour_local, opens) VALUES ($1, 8, 1)
       ON CONFLICT (user_id, hour_local) DO UPDATE SET opens = app_open_hours.opens + 1`,
      [owner],
    );
    expect(await count(owner, 'app_open_hours WHERE user_id = $1', [owner])).toBe(1);
  });

  it('is never published and never synced', async () => {
    const { rows } = await harness.db.pool.query(
      `SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = 'app_open_hours'`,
    );
    expect(rows).toEqual([]);
    const yaml = JSON.stringify(harness.config);
    expect(yaml).not.toContain('app_open_hours');
  });
});

describe('guide_reader', () => {
  it.each(['app_open_hours', 'nudges', 'home_tips', 'saved_items', 'reminders'])(
    'cannot read %s',
    async (table) => {
      const { actors, tripId } = harness.fixture;
      await expect(
        withGuideReader(harness.db.pool, actors.member, tripId, (tx) =>
          tx.query(`SELECT 1 FROM ${table} LIMIT 1`),
        ),
      ).rejects.toThrow(/permission denied/i);
    },
  );
});

describe('saved_items and reminders', () => {
  it('sync to their owner only', async () => {
    const organiser = await harness.rows('me', 'organiser');
    expect(organiser.get('saved_items') ?? []).toHaveLength(1);
    expect(organiser.get('reminders') ?? []).toHaveLength(1);
    const member = await harness.rows('me', 'member');
    expect(member.get('saved_items') ?? []).toEqual([]);
    expect(member.get('reminders') ?? []).toEqual([]);
  });

  it('let the owner rename a save but not move it to someone else', async () => {
    const { actors } = harness.fixture;
    await as(actors.organiser, "UPDATE saved_items SET list_name = 'Someday' WHERE user_id = $1", [
      actors.organiser,
    ]);
    await expect(
      as(actors.organiser, 'UPDATE saved_items SET user_id = $2 WHERE user_id = $1', [
        actors.organiser,
        actors.member,
      ]),
    ).rejects.toThrow(/permission denied/i);
  });
});

describe('me stream: own trip participant rows', () => {
  it("carries the caller's own countdown row and nobody else's", async () => {
    const rows = (await harness.rows('me', 'member')).get('trip_participants') ?? [];
    expect(rows.map((row) => row['user_id'])).toEqual([harness.fixture.actors.member]);
    expect((await harness.rows('me', 'outsider')).get('trip_participants') ?? []).toEqual([]);
  });
});

describe('inbox_items', () => {
  it('lets the owner mark read and resolve, and nothing else', async () => {
    const { actors } = harness.fixture;
    await as(actors.member, 'UPDATE inbox_items SET read_at = now() WHERE id = $1', [inboxItemId]);
    await expect(
      as(actors.member, 'UPDATE inbox_items SET needs_you = false WHERE id = $1', [inboxItemId]),
    ).rejects.toThrow(/permission denied/i);
    const { rowCount } = await as(
      actors.organiser,
      'UPDATE inbox_items SET read_at = now() WHERE id = $1',
      [inboxItemId],
    );
    expect(rowCount).toBe(0);
  });

  it('keeps the resolver and badge counts to the system', async () => {
    const { actors } = harness.fixture;
    await expect(
      as(actors.member, "SELECT * FROM app.resolve_inbox_items(ARRAY['probe:1'], now())"),
    ).rejects.toThrow(/permission denied/i);
    const before = await asSystem<{ needs_you: number }>(
      'SELECT * FROM app.inbox_badge_counts($1, now())',
      [actors.member],
    );
    expect(before.rows[0]?.needs_you).toBe(1);
    const resolved = await asSystem<{ user_id: string }>(
      "SELECT * FROM app.resolve_inbox_items(ARRAY['probe:1'], now())",
    );
    expect(resolved.rows.map((row) => row.user_id)).toEqual([actors.member]);
    const after = await asSystem<{ needs_you: number }>(
      'SELECT * FROM app.inbox_badge_counts($1, now())',
      [actors.member],
    );
    expect(after.rows[0]?.needs_you).toBe(0);
  });
});
