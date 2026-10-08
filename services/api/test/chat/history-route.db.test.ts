/**
 * `GET /v1/crews/{crew_id}/chat/messages` against a migrated Postgres: a member pages back from the
 * edge of the 1,000-message window to the first message in the shape the phone stores, with the
 * page's reactions and without what moderation hid; a former member who kept the chat reads too;
 * anyone else, signed in or not, gets nothing; a page is at most 200 messages.
 */
import { withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerChatCommands } from '../../src/commands/chat';
import {
  CHAT_HISTORY_PAGE_MAX,
  registerChatHistoryRoute,
  type ChatHistoryPage,
} from '../../src/commands/chat/history-route';
import { registerCrewCommands } from '../../src/commands/crews';
import {
  startCommandDoors,
  type CommandDoorsHarness,
  type SignedIn,
} from '../routes/command-doors-harness';
import { chatCrew, sql, type ChatCrew } from './chat-fixture';

const SENT = 1010;

let doors: CommandDoorsHarness;
let crew: ChatCrew;
let kept: SignedIn;
let outsider: SignedIn;
/** The lowest seq still inside the sync window: where a phone's own rows end. */
let edge: number;
let hiddenSeq: number;
let reactedId: string;

async function page(session: SignedIn | null, query: string, crewId = crew.crewId) {
  const response = await doors.request(`/v1/crews/${crewId}/chat/messages?${query}`, {
    headers: session === null ? {} : { cookie: session.cookie },
  });
  return {
    status: response.status,
    body: (await response.json()) as ChatHistoryPage & { error?: { code: string } },
  };
}

beforeAll(async () => {
  doors = await startCommandDoors(
    (registry) => {
      registerCrewCommands(registry);
      registerChatCommands(registry);
    },
    (app, deps) => registerChatHistoryRoute(app, deps),
  );
  crew = await chatCrew(doors, 2);
  kept = crew.members[1]!;
  outsider = await doors.signInAnonymously();
  await withSystem(doors.pool, async (tx) => {
    await tx.query(
      `INSERT INTO messages (crew_id, sender_kind, sender_id, type, body, mentions)
       SELECT $1, 'user', $2, 'text', 'line ' || n, ARRAY[$3]::uuid[]
         FROM generate_series(1, $4::int) n`,
      [crew.crewId, crew.owner.uid, crew.members[0]!.uid, SENT],
    );
    await tx.query(
      "UPDATE crew_members SET status = 'former', keep_in_chat = true WHERE crew_id = $1 AND user_id = $2",
      [crew.crewId, kept.uid],
    );
  });
  const [window] = await sql<{ edge: string }>(
    doors,
    'SELECT min(seq) AS edge FROM messages WHERE crew_id = $1 AND in_sync_window',
    [crew.crewId],
  );
  edge = Number(window!.edge);
  hiddenSeq = edge - 2;
  const [reacted] = await sql<{ id: string }>(
    doors,
    'SELECT id FROM messages WHERE crew_id = $1 AND seq = $2',
    [crew.crewId, edge - 1],
  );
  reactedId = reacted!.id;
  await withSystem(doors.pool, async (tx) => {
    await tx.query('UPDATE messages SET hidden_at = now() WHERE crew_id = $1 AND seq = $2', [
      crew.crewId,
      hiddenSeq,
    ]);
    await tx.query(
      "INSERT INTO message_reactions (message_id, crew_id, user_id, emoji) VALUES ($1, $2, $3, '🔥')",
      [reactedId, crew.crewId, crew.members[0]!.uid],
    );
  });
}, 240_000);

afterAll(async () => {
  await doors?.stop();
});

describe('older chat pages', () => {
  it('gives a member the page below the window as the phone stores rows, with its reactions', async () => {
    const { status, body } = await page(crew.members[0]!, `before_seq=${edge}&limit=3`);
    expect(status).toBe(200);
    // The hidden message is skipped, not counted.
    expect(body.messages.map((row) => row.seq)).toEqual([edge - 1, edge - 3, edge - 4]);
    expect(body.has_more).toBe(true);
    const [newest] = body.messages;
    expect(newest).toMatchObject({
      id: reactedId,
      crew_id: crew.crewId,
      sender_kind: 'user',
      sender_id: crew.owner.uid,
      type: 'text',
      mentions: JSON.stringify([crew.members[0]!.uid]),
      mentions_guide: 0,
      attachments: '[]',
      edited_at: null,
      deleted_at: null,
      hidden_at: null,
      in_sync_window: 0,
    });
    expect(newest!.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/);
    expect(body.reactions).toEqual([
      expect.objectContaining({
        message_id: reactedId,
        crew_id: crew.crewId,
        user_id: crew.members[0]!.uid,
        emoji: '🔥',
        in_sync_window: 0,
      }),
    ]);
  });

  it('pages down to the first message and says when nothing older is left', async () => {
    const seen: number[] = [];
    let before = edge;
    for (let guard = 0; guard < 10; guard += 1) {
      const { body } = await page(crew.owner, `before_seq=${before}`);
      expect(body.messages.length).toBeLessThanOrEqual(CHAT_HISTORY_PAGE_MAX);
      seen.push(...body.messages.map((row) => row.seq));
      if (!body.has_more) break;
      before = body.messages.at(-1)!.seq;
    }
    const expected = [];
    for (let seq = edge - 1; seq >= 1; seq -= 1) if (seq !== hiddenSeq) expected.push(seq);
    expect(seen).toEqual(expected);
    const start = await page(crew.owner, 'before_seq=1');
    expect(start.body).toEqual({ messages: [], reactions: [], has_more: false });
  });

  it('lets a former member who kept the chat read, and nobody outside the crew', async () => {
    expect((await page(kept, `before_seq=${edge}&limit=1`)).body.messages).toHaveLength(1);
    const foreign = await page(outsider, `before_seq=${edge}`);
    expect(foreign.status).toBe(404);
    expect(foreign.body.error?.code).toBe('NOT_FOUND');
    expect(foreign.body.messages).toBeUndefined();
    await withSystem(doors.pool, (tx) =>
      tx.query('UPDATE crew_members SET keep_in_chat = false WHERE crew_id = $1 AND user_id = $2', [
        crew.crewId,
        kept.uid,
      ]),
    );
    expect((await page(kept, `before_seq=${edge}`)).status).toBe(404);
    expect((await page(null, `before_seq=${edge}`)).status).toBe(401);
  });

  it('refuses a page it cannot bound', async () => {
    for (const query of [
      '',
      'before_seq=0',
      'before_seq=abc',
      `before_seq=${edge}&limit=0`,
      `before_seq=${edge}&limit=${CHAT_HISTORY_PAGE_MAX + 1}`,
      `before_seq=${edge}&limit=1.5`,
    ]) {
      const refused = await page(crew.owner, query);
      expect(refused.status, query).toBe(422);
      expect(refused.body.error?.code, query).toBe('VALIDATION');
    }
  });
});
