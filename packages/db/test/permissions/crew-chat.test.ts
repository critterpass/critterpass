/**
 * Crew chat permissions: `messages` and `message_reactions` (RLS class M, chat variant),
 * `crew_chat_counters` (system only), the `crew_chat` sync stream and the guide's `llm.chat_window`.
 * Active members read and write; a former member who kept the chat reads but cannot write; removed
 * members and outsiders see nothing; moderation-hidden rows vanish for app_user and the stream.
 * The stream sends only a crew's latest 1,000 messages and their reactions; RLS still reads the rest.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withGuideReader, withSystem, withUser } from '../../src/tx';
import { insertCrewMember, insertUser } from '../helpers/actors';
import { evaluateStream, startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;
let former: string;
let formerNoKeep: string;
let visibleId: string;
let hiddenId: string;
let pollId: string;
let orderId: string;

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

async function send(uid: string, body: string): Promise<string> {
  const id = randomUUID();
  await as(
    uid,
    `INSERT INTO messages (id, crew_id, sender_kind, sender_id, type, body)
     VALUES ($1, $2, 'user', $3, 'text', $4)`,
    [id, harness.fixture.crewId, uid, body],
  );
  return id;
}

async function card(type: string, body: string): Promise<string> {
  const { rows } = await asSystem<{ id: string }>(
    `INSERT INTO messages (crew_id, sender_kind, type, body, ref_kind, ref_id,
       attachments)
     VALUES ($1, 'system', $2, $3, $2, uuidv7(), '[]') RETURNING id`,
    [harness.fixture.crewId, type, body],
  );
  return rows[0]!.id;
}

beforeAll(async () => {
  harness = await startStreamHarness();
  const { crewId, actors } = harness.fixture;
  await withSystem(harness.db.pool, async (tx) => {
    former = await insertUser(tx);
    formerNoKeep = await insertUser(tx);
    await insertCrewMember(tx, { crewId, userId: former });
    await insertCrewMember(tx, { crewId, userId: formerNoKeep });
    await tx.query("UPDATE users SET display_name = 'Maya' WHERE id = $1", [actors.member]);
  });
  visibleId = await send(actors.member, 'hello crew');
  hiddenId = await send(actors.member, 'spam');
  pollId = await card('poll', 'poll payload');
  orderId = await card('supplier_order', 'viator hold payload');
  await asSystem('UPDATE messages SET hidden_at = now() WHERE id = $1', [hiddenId]);
  await asSystem(
    `UPDATE crew_members SET status = 'former', keep_in_chat = (user_id = $2)
     WHERE crew_id = $1 AND user_id IN ($2, $3)`,
    [crewId, former, formerNoKeep],
  );
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

describe('messages', () => {
  it('assigns a gap-free seq per crew in insert order', async () => {
    const { rows } = await asSystem<{ seq: string }>(
      'SELECT seq FROM messages WHERE crew_id = $1 ORDER BY seq',
      [harness.fixture.crewId],
    );
    const seqs = rows.map((row) => Number(row.seq));
    expect(seqs).toEqual(seqs.map((_, index) => index + 1));
  });

  it('shows members and keep-in-chat former members the visible rows only', async () => {
    const { actors } = harness.fixture;
    const sql = 'SELECT id FROM messages WHERE id = ANY($1)';
    for (const uid of [actors.member, actors.organiser, former]) {
      const ids = (await as<{ id: string }>(uid, sql, [[visibleId, hiddenId]])).rows;
      expect(ids.map((row) => row.id)).toEqual([visibleId]);
    }
  });

  it('shows removed, left-without-keep members and outsiders nothing', async () => {
    const { actors } = harness.fixture;
    for (const uid of [actors.exMember, actors.outsider, actors.anonymous, formerNoKeep]) {
      expect((await as(uid, 'SELECT id FROM messages')).rows).toEqual([]);
    }
  });

  it('writes system rows when a member joins or leaves', async () => {
    const { rows } = await asSystem<{ ref_kind: string; ref_id: string }>(
      `SELECT ref_kind, ref_id FROM messages WHERE crew_id = $1 AND type = 'system' AND ref_id = $2
       ORDER BY seq`,
      [harness.fixture.crewId, former],
    );
    expect(rows.map((row) => row.ref_kind)).toEqual(['member_joined', 'member_left']);
  });

  it('lets a former member read but never insert, and an outsider neither', async () => {
    const { actors } = harness.fixture;
    for (const uid of [former, actors.exMember, actors.outsider]) {
      await expect(send(uid, 'let me in')).rejects.toThrow(/row-level security/i);
    }
  });

  it('refuses a message sent in someone else’s name or with a client seq', async () => {
    const { actors, crewId } = harness.fixture;
    await expect(
      as(
        actors.member,
        `INSERT INTO messages (crew_id, sender_kind, sender_id, type, body)
         VALUES ($1, 'user', $2, 'text', 'forged')`,
        [crewId, actors.organiser],
      ),
    ).rejects.toThrow(/row-level security/i);
    await expect(
      as(
        actors.member,
        `INSERT INTO messages (crew_id, sender_kind, sender_id, type, body, seq)
         VALUES ($1, 'user', $2, 'text', 'jump the queue', 1)`,
        [crewId, actors.member],
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('lets only the sender edit, and never hide', async () => {
    const { actors } = harness.fixture;
    const edited = await as(actors.organiser, "UPDATE messages SET body = 'hijack' WHERE id = $1", [
      visibleId,
    ]);
    expect(edited.rowCount).toBe(0);
    const own = await as(
      actors.member,
      "UPDATE messages SET body = 'hello crew!', edited_at = now() WHERE id = $1",
      [visibleId],
    );
    expect(own.rowCount).toBe(1);
    await expect(
      as(actors.member, 'UPDATE messages SET hidden_at = NULL WHERE id = $1', [hiddenId]),
    ).rejects.toThrow(/permission denied/i);
  });
});

describe('message_reactions', () => {
  it('lets members react as themselves, takes the crew from the message and hides from others', async () => {
    const { actors } = harness.fixture;
    await as(
      actors.organiser,
      `INSERT INTO message_reactions (message_id, crew_id, user_id, emoji)
       VALUES ($1, $2, $3, '🔥')`,
      [visibleId, randomUUID(), actors.organiser],
    );
    const { rows } = await as<{ crew_id: string }>(
      former,
      'SELECT crew_id FROM message_reactions WHERE message_id = $1',
      [visibleId],
    );
    expect(rows).toEqual([{ crew_id: harness.fixture.crewId }]);
    expect((await as(actors.outsider, 'SELECT id FROM message_reactions')).rows).toEqual([]);
    await expect(
      as(
        former,
        `INSERT INTO message_reactions (message_id, user_id, emoji) VALUES ($1, $2, '👍')`,
        [visibleId, former],
      ),
    ).rejects.toThrow(/row-level security/i);
    await expect(
      as(
        actors.member,
        `INSERT INTO message_reactions (message_id, user_id, emoji) VALUES ($1, $2, '👍')`,
        [visibleId, actors.organiser],
      ),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe('taking a reaction back', () => {
  it('removes only the caller’s own reaction, through the function, never a raw DELETE', async () => {
    const { actors } = harness.fixture;
    await as(
      actors.member,
      `INSERT INTO message_reactions (message_id, user_id, emoji) VALUES ($1, $2, '😂')`,
      [visibleId, actors.member],
    );
    await expect(
      as(actors.member, 'DELETE FROM message_reactions WHERE message_id = $1', [visibleId]),
    ).rejects.toThrow(/permission denied/i);
    const foreign = await as<{ removed: boolean }>(
      actors.member,
      "SELECT app.remove_message_reaction($1, '🔥') AS removed",
      [visibleId],
    );
    expect(foreign.rows).toEqual([{ removed: false }]);
    const own = await as<{ removed: boolean }>(
      actors.member,
      "SELECT app.remove_message_reaction($1, '😂') AS removed",
      [visibleId],
    );
    expect(own.rows).toEqual([{ removed: true }]);
  });
});

describe('crew_chat_counters', () => {
  it('is unreadable and unwritable through app_user', async () => {
    await expect(
      as(harness.fixture.actors.member, 'SELECT * FROM crew_chat_counters'),
    ).rejects.toThrow(/permission denied/i);
  });
});

describe('crew_chat stream', () => {
  it('syncs visible messages and reactions to members, nothing to ex-members or outsiders', async () => {
    const memberRows = await harness.rows('crew_chat', 'member');
    const ids = (memberRows.get('messages') ?? []).map((row) => row['id']);
    expect(ids).toContain(visibleId);
    expect(ids).not.toContain(hiddenId);
    expect(memberRows.get('message_reactions')).toHaveLength(1);

    for (const actor of ['exMember', 'outsider', 'anonymous'] as const) {
      const rows = await harness.rows('crew_chat', actor);
      expect(rows.get('messages') ?? [], actor).toEqual([]);
      expect(rows.get('message_reactions') ?? [], actor).toEqual([]);
    }
  });

  it('evaluates the kept-chat query for a former member through the stream config', async () => {
    const rows = await evaluateStream(harness.db.pool, harness.config, 'crew_chat', {
      userId: former,
    });
    expect((rows.get('messages') ?? []).map((row) => row['id'])).toContain(visibleId);
    const none = await evaluateStream(harness.db.pool, harness.config, 'crew_chat', {
      userId: formerNoKeep,
    });
    expect(none.get('messages') ?? []).toEqual([]);
  });
});

describe('llm.chat_window', () => {
  const columns = ['author_kind', 'author_name', 'body', 'created_at', 'crew_id', 'seq', 'type'];

  it('exposes no attachment or card payload column', async () => {
    const { rows } = await harness.db.pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'llm' AND table_name = 'chat_window' ORDER BY column_name`,
    );
    expect(rows.map((row) => row.column_name)).toEqual(columns);
  });

  it('gives the guide visible text rows with author names, never cards, hidden or system rows', async () => {
    const { actors, crewId, tripId } = harness.fixture;
    const rows = await withGuideReader(
      harness.db.pool,
      actors.member,
      tripId,
      async (tx) =>
        (
          await tx.query<{ body: string; author_name: string; type: string }>(
            'SELECT body, author_name, type FROM llm.chat_window($1, 50)',
            [crewId],
          )
        ).rows,
    );
    expect(rows).toEqual([{ body: 'hello crew!', author_name: 'Maya', type: 'text' }]);
    const bodies = rows.map((row) => row.body);
    expect(bodies).not.toContain('poll payload');
    expect(bodies).not.toContain('viator hold payload');
    const cards = await asSystem('SELECT id FROM messages WHERE id = ANY($1)', [[pollId, orderId]]);
    expect(cards.rowCount).toBe(2);
  });

  it('shows an outsider nothing and denies the base table to guide_reader', async () => {
    const { actors, crewId, tripId } = harness.fixture;
    const rows = await withGuideReader(
      harness.db.pool,
      actors.outsider,
      tripId,
      async (tx) =>
        (await tx.query<{ seq: string }>('SELECT seq FROM llm.chat_window($1, 50)', [crewId])).rows,
    );
    expect(rows).toEqual([]);
    await expect(
      withGuideReader(harness.db.pool, actors.member, tripId, (tx) =>
        tx.query('SELECT body FROM messages LIMIT 1'),
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});

describe('chat sync window', () => {
  const WINDOW = 1000;
  let recentId: string;

  async function flags(): Promise<{ inside: number; lowestInside: number; lastSeq: number }> {
    const { rows } = await asSystem<{ inside: number; lowest: string; last: string }>(
      `SELECT count(*) FILTER (WHERE in_sync_window)::int AS inside,
              min(seq) FILTER (WHERE in_sync_window) AS lowest, max(seq) AS last
         FROM messages WHERE crew_id = $1`,
      [harness.fixture.crewId],
    );
    return {
      inside: rows[0]!.inside,
      lowestInside: Number(rows[0]!.lowest),
      lastSeq: Number(rows[0]!.last),
    };
  }

  beforeAll(async () => {
    const { crewId, actors } = harness.fixture;
    await as(
      actors.organiser,
      `INSERT INTO message_reactions (message_id, user_id, emoji) VALUES ($1, $2, '🌊')`,
      [visibleId, actors.organiser],
    );
    await asSystem(
      `INSERT INTO messages (crew_id, sender_kind, type, body)
       SELECT $1, 'system', 'system', 'line ' || n FROM generate_series(1, $2::int) n`,
      [crewId, WINDOW],
    );
    recentId = await send(actors.member, 'still on the phone');
  });

  it('keeps exactly the latest 1,000 by seq inside, whatever was sent before', async () => {
    const { inside, lowestInside, lastSeq } = await flags();
    expect(inside).toBe(WINDOW);
    expect(lowestInside).toBe(lastSeq - WINDOW + 1);
    const { rows } = await asSystem<{ in_sync_window: boolean }>(
      'SELECT in_sync_window FROM messages WHERE id = ANY($1::uuid[])',
      [[visibleId, hiddenId, pollId]],
    );
    expect(rows.map((row) => row.in_sync_window)).toEqual([false, false, false]);
  });

  it('takes a message’s reactions out with it, and a later reaction to it never comes in', async () => {
    const { actors } = harness.fixture;
    await as(
      actors.member,
      `INSERT INTO message_reactions (message_id, user_id, emoji) VALUES ($1, $2, '🙌')`,
      [visibleId, actors.member],
    );
    await as(
      actors.organiser,
      `INSERT INTO message_reactions (message_id, user_id, emoji) VALUES ($1, $2, '👋')`,
      [recentId, actors.organiser],
    );
    const { rows } = await asSystem<{ emoji: string; in_sync_window: boolean }>(
      `SELECT emoji, in_sync_window FROM message_reactions
        WHERE message_id = ANY($1::uuid[]) AND emoji IN ('🌊', '🙌', '👋') ORDER BY emoji`,
      [[visibleId, recentId]],
    );
    expect(Object.fromEntries(rows.map((row) => [row.emoji, row.in_sync_window]))).toEqual({
      '🌊': false,
      '🙌': false,
      '👋': true,
    });
  });

  it('syncs the window and its reactions only, while members still read older rows', async () => {
    const { actors } = harness.fixture;
    for (const rows of [
      await harness.rows('crew_chat', 'member'),
      await evaluateStream(harness.db.pool, harness.config, 'crew_chat', { userId: former }),
    ]) {
      const messages = rows.get('messages') ?? [];
      expect(messages).toHaveLength(WINDOW);
      const ids = new Set(messages.map((row) => row['id']));
      expect(ids.has(recentId)).toBe(true);
      expect(ids.has(visibleId)).toBe(false);
      const reacted = (rows.get('message_reactions') ?? []).map((row) => row['message_id']);
      expect(reacted).toContain(recentId);
      expect(reacted.every((id) => ids.has(id))).toBe(true);
    }
    const older = await as(actors.member, 'SELECT id FROM messages WHERE id = $1', [visibleId]);
    expect(older.rows).toHaveLength(1);
  });

  it('is not the member’s to set, and a deleted message keeps its place in it', async () => {
    const { actors } = harness.fixture;
    await expect(
      as(actors.member, 'UPDATE messages SET in_sync_window = true WHERE id = $1', [visibleId]),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      as(
        actors.member,
        `INSERT INTO message_reactions (message_id, user_id, emoji, in_sync_window)
         VALUES ($1, $2, '👀', true)`,
        [visibleId, actors.member],
      ),
    ).rejects.toThrow(/permission denied/i);
    const before = await flags();
    await as(actors.member, "UPDATE messages SET deleted_at = now(), body = '' WHERE id = $1", [
      recentId,
    ]);
    expect(await flags()).toEqual(before);
  });

  it('reverses cleanly, and a member can still react afterwards', async () => {
    const { crewId, actors } = harness.fixture;
    const client = await harness.db.pool.connect();
    try {
      await client.query('BEGIN');
      // The reaction trigger goes back to copying the crew alone: it must not read a dropped column.
      await client.query(`
        DROP TRIGGER messages_slide_sync_window ON messages;
        DROP FUNCTION app.slide_chat_sync_window();
        CREATE OR REPLACE FUNCTION app.message_reaction_crew() RETURNS trigger
        LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
        BEGIN
          SELECT m.crew_id INTO NEW.crew_id FROM messages m WHERE m.id = NEW.message_id;
          RETURN NEW;
        END;
        $$;
        DROP INDEX messages_sync_window_idx;
        ALTER TABLE message_reactions DROP COLUMN in_sync_window;
        ALTER TABLE messages DROP COLUMN in_sync_window;
      `);
      const { rows } = await client.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM information_schema.columns
          WHERE table_schema = 'public' AND column_name = 'in_sync_window'`,
      );
      expect(rows).toEqual([{ n: 0 }]);
      await client.query('SET LOCAL ROLE app_user');
      await client.query("SELECT set_config('app.uid', $1, true)", [actors.member]);
      const reacted = await client.query<{ crew_id: string }>(
        `INSERT INTO message_reactions (message_id, user_id, emoji) VALUES ($1, $2, '🧭')
         RETURNING crew_id`,
        [recentId, actors.member],
      );
      expect(reacted.rows).toEqual([{ crew_id: crewId }]);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });
});

describe('migration', () => {
  it('reverses cleanly', async () => {
    const client = await harness.db.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`
        DROP FUNCTION llm.chat_window(uuid, integer);
        DROP VIEW llm.chat_window;
        DROP TRIGGER crews_chat_rename_row ON crews;
        DROP TRIGGER crew_members_chat_rows ON crew_members;
        DROP FUNCTION app.crews_chat_rename_row();
        DROP FUNCTION app.crew_members_chat_rows();
        DROP FUNCTION app.post_crew_system_message(uuid, text, uuid, text);
        ALTER PUBLICATION powersync DROP TABLE messages, message_reactions;
        DROP TABLE message_reactions;
        DROP TABLE messages;
        DROP TABLE crew_chat_counters;
        DROP FUNCTION app.assign_message_seq();
        DROP FUNCTION app.message_reaction_crew();
        DROP FUNCTION app.remove_message_reaction(uuid, text);
        ALTER TABLE user_settings DROP COLUMN muted_uids;
        ALTER TABLE crew_members DROP COLUMN last_read_seq;
        ALTER TABLE crew_members ADD COLUMN last_read_message_id uuid;
      `);
      const { rows } = await client.query<{ n: number }>(
        "SELECT count(*)::int AS n FROM pg_class WHERE relname IN ('messages', 'message_reactions')",
      );
      expect(rows).toEqual([{ n: 0 }]);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });
});
