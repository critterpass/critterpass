/**
 * "Ping me" on a slow guide answer: the caller asks for a ping on a thread they can read (asking
 * twice is one ping), and saving the thread's next answer pushes everyone waiting and clears their
 * pings; a ping left from long ago pushes nothing.
 */
import { randomUUID } from 'node:crypto';

import { withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerGuideCommands } from '../../../src/commands/guide';
import { pingWaiting, pushAnswerPings } from '../../../src/commands/guide/answer-pings';
import {
  envelope,
  startCommandDoors,
  type CommandDoorsHarness,
  type SignedIn,
} from '../../routes/command-doors-harness';

let harness: CommandDoorsHarness;

beforeAll(async () => {
  harness = await startCommandDoors(registerGuideCommands);
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

async function ping(session: SignedIn, threadId: string) {
  const response = await harness.request('/v1/cmd/ping_guide_answer', {
    method: 'POST',
    headers: { cookie: session.cookie },
    body: JSON.stringify(envelope('ping_guide_answer', { thread_id: threadId })),
  });
  return (await response.json()) as { result?: unknown; error?: { code: string } };
}

async function thread(uid: string): Promise<string> {
  const id = randomUUID();
  await harness.pool.query(
    "INSERT INTO guide_threads (id, user_id, mode) VALUES ($1, $2, 'private')",
    [id, uid],
  );
  return id;
}

async function answer(threadId: string): Promise<{ messageId: string; pushed: number }> {
  const messageId = randomUUID();
  const pushed = await withSystem(harness.pool, async (tx) => {
    await tx.query(
      "INSERT INTO guide_messages (id, thread_id, role, content) VALUES ($1, $2, 'guide', 'Here it is')",
      [messageId, threadId],
    );
    return pushAnswerPings(tx, { id: threadId, tripId: null }, messageId);
  });
  return { messageId, pushed };
}

async function readyEvents(messageId: string) {
  const { rows } = await harness.pool.query<{ payload: Record<string, unknown> }>(
    "SELECT payload FROM domain_events WHERE type = 'guide.answer_ready' AND aggregate_id = $1",
    [messageId],
  );
  return rows.map((row) => row.payload);
}

describe('ping_guide_answer', () => {
  it('pings the asker once when the answer lands, and clears the ping', async () => {
    const me = await harness.signInAnonymously();
    const threadId = await thread(me.uid);
    expect((await ping(me, threadId)).error).toBeUndefined();
    expect((await ping(me, threadId)).error).toBeUndefined();
    expect(await withSystem(harness.pool, (tx) => pingWaiting(tx, threadId))).toBe(true);

    const { messageId, pushed } = await answer(threadId);
    expect(pushed).toBe(1);
    expect(await readyEvents(messageId)).toEqual([
      expect.objectContaining({ user_id: me.uid, thread_id: threadId, message_id: messageId }),
    ]);
    expect(await withSystem(harness.pool, (tx) => pingWaiting(tx, threadId))).toBe(false);

    const next = await answer(threadId);
    expect(next.pushed).toBe(0);
    expect(await readyEvents(next.messageId)).toEqual([]);
  });

  it("refuses a thread the caller can't read", async () => {
    const owner = await harness.signInAnonymously();
    const other = await harness.signInAnonymously();
    const threadId = await thread(owner.uid);
    expect((await ping(other, threadId)).error?.code).toBe('NOT_FOUND');
  });

  it('pushes nothing for a ping left from long ago', async () => {
    const me = await harness.signInAnonymously();
    const threadId = await thread(me.uid);
    await withSystem(harness.pool, (tx) =>
      tx.query(
        "INSERT INTO guide_answer_pings (thread_id, user_id, requested_at) VALUES ($1, $2, now() - interval '3 hours')",
        [threadId, me.uid],
      ),
    );
    expect(await withSystem(harness.pool, (tx) => pingWaiting(tx, threadId))).toBe(false);
    const { messageId, pushed } = await answer(threadId);
    expect(pushed).toBe(0);
    expect(await readyEvents(messageId)).toEqual([]);
  });
});
