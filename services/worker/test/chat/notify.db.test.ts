/**
 * The crew chat push against a migrated Postgres: the audience honours each member's per-crew
 * level (mentions when never chosen), leaves out the sender and anyone who muted them, and the
 * composed push threads and collapses by crew with the ids REPLY and READ need. A message deleted
 * before the push goes out composes to nothing.
 */
import { randomUUID } from 'node:crypto';

import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerChatNotifications } from '../../src/jobs/chat/notify';
import { getRegistration, type RoutedEvent } from '../../src/jobs/notify/register';
import { startJobsHarness, type JobsHarness } from '../helpers/jobs-harness';

let harness: JobsHarness;
let crewId: string;
const people: Record<'sender' | 'all' | 'mentions' | 'unset' | 'off' | 'muter', string> = {
  sender: randomUUID(),
  all: randomUUID(),
  mentions: randomUUID(),
  unset: randomUUID(),
  off: randomUUID(),
  muter: randomUUID(),
};

async function q<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return (await harness.pool.query(sql, params)).rows as T[];
}

beforeAll(async () => {
  harness = await startJobsHarness();
  registerChatNotifications();
  for (const [name, id] of Object.entries(people)) {
    await q("INSERT INTO users (id, status, display_name) VALUES ($1, 'registered', $2)", [
      id,
      name === 'sender' ? 'Maya Tran' : name,
    ]);
  }
  const [crew] = await q<{ id: string }>(
    "INSERT INTO crews (name, created_by) VALUES ('Bali gang', $1) RETURNING id",
    [people.sender],
  );
  crewId = crew!.id;
  const levels: Record<string, string | null> = {
    sender: 'all',
    all: 'all',
    mentions: 'mentions',
    unset: null,
    off: 'off',
    muter: 'all',
  };
  for (const [name, id] of Object.entries(people)) {
    await q('INSERT INTO crew_members (crew_id, user_id, notify_level) VALUES ($1, $2, $3)', [
      crewId,
      id,
      levels[name],
    ]);
  }
  await q('INSERT INTO user_settings (user_id, muted_uids) VALUES ($1, ARRAY[$2::uuid])', [
    people.muter,
    people.sender,
  ]);
}, 240_000);

afterAll(async () => {
  await harness?.close();
});

async function sent(body: string, mentions: string[], replyTo: string | null = null) {
  const [row] = await q<{ id: string; seq: string }>(
    `INSERT INTO messages (crew_id, sender_kind, sender_id, type, body, mentions)
     VALUES ($1, 'user', $2, 'text', $3, $4::uuid[]) RETURNING id, seq`,
    [crewId, people.sender, body, mentions],
  );
  const event: RoutedEvent = {
    id: randomUUID(),
    type: 'chat.message_sent',
    payload: {
      crew_id: crewId,
      message_id: row!.id,
      seq: Number(row!.seq),
      type: 'text',
      sender_id: people.sender,
      mentions,
      mentions_guide: false,
      reply_to_sender_id: replyTo,
    },
    crewId,
    tripId: null,
    actorId: people.sender,
    occurredAt: new Date(),
  };
  return { id: row!.id, event };
}

async function withClient<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await harness.pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

const registration = () => getRegistration('chat.message_sent', 'crew_chat')!;

describe('crew chat audience', () => {
  it('sends a plain message in a crew of six to `all` and never-chosen members, never to the sender or a muter', async () => {
    const { event } = await sent('dinner at 8?', []);
    const audience = await withClient((c) => registration().audience(c, event));
    expect([...audience].sort()).toEqual([people.all, people.unset].sort());
  });

  it('adds mentioned members at `mentions` or never-chosen level, never `off`', async () => {
    const { event } = await sent('@all', [people.mentions, people.unset, people.off, people.muter]);
    const audience = await withClient((c) => registration().audience(c, event));
    expect([...audience].sort()).toEqual([people.all, people.mentions, people.unset].sort());
  });

  it('counts a reply to a mentions-level member as theirs', async () => {
    const { event } = await sent('yes!', [], people.mentions);
    const audience = await withClient((c) => registration().audience(c, event));
    expect([...audience].sort()).toEqual([people.all, people.mentions, people.unset].sort());
  });

  it('keeps never-chosen members on mentions once the crew outgrows six, and a choice always wins', async () => {
    const seventh = randomUUID();
    await q("INSERT INTO users (id, status, display_name) VALUES ($1, 'registered', 'seventh')", [
      seventh,
    ]);
    await q('INSERT INTO crew_members (crew_id, user_id) VALUES ($1, $2)', [crewId, seventh]);
    const plain = await sent('anyone up?', []);
    expect(await withClient((c) => registration().audience(c, plain.event))).toEqual([people.all]);
    const mention = await sent('@seventh', [seventh]);
    expect(
      [...(await withClient((c) => registration().audience(c, mention.event)))].sort(),
    ).toEqual([people.all, seventh].sort());
    // Back to six active members: the never-chosen hear everything again, `mentions` stays put.
    await q("UPDATE crew_members SET status = 'left' WHERE crew_id = $1 AND user_id = $2", [
      crewId,
      seventh,
    ]);
    const small = await sent('just us', []);
    expect([...(await withClient((c) => registration().audience(c, small.event)))].sort()).toEqual(
      [people.all, people.unset].sort(),
    );
  });
});

describe('crew chat push copy', () => {
  it('comes from the sender, threads and collapses by crew and carries the READ seq', async () => {
    const { event } = await sent('meet {at} the pier', []);
    const composed = await withClient((c) => registration().compose(c, event, people.all));
    expect(composed).toMatchObject({
      sender: { kind: 'member', id: people.sender, name: 'Maya' },
      vars: { sender: 'Maya', crew: 'Bali gang', text: 'meet {at} the pier' },
      body: { message: '{text}' },
      threadId: crewId,
      collapseVars: { crew_id: crewId },
      deepLink: `/crew/${crewId}/chat`,
      ctx: { crew_id: crewId, seq: event.payload['seq'] },
    });
  });

  it('says nothing once the message is deleted', async () => {
    const { id, event } = await sent('oops', []);
    await q("UPDATE messages SET deleted_at = now(), body = '' WHERE id = $1", [id]);
    expect(await withClient((c) => registration().compose(c, event, people.all))).toBeNull();
  });
});
