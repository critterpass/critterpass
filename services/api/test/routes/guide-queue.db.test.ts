/**
 * Queued guide questions through the command door: ASK AT MIDNIGHT is accepted only while today's
 * free answers are spent, waits for that day's reset, once per day; cancelling frees the day; and
 * rating an answer is kept on the message.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerGuideCommands } from '../../src/commands/guide';
import {
  envelope,
  startCommandDoors,
  type CommandDoorsHarness,
  type SignedIn,
} from './command-doors-harness';

let harness: CommandDoorsHarness;

beforeAll(async () => {
  harness = await startCommandDoors(registerGuideCommands);
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

async function send(session: SignedIn, cmd: string, payload: unknown) {
  const response = await harness.request(`/v1/cmd/${cmd}`, {
    method: 'POST',
    headers: { cookie: session.cookie },
    body: JSON.stringify(envelope(cmd, payload)),
  });
  return {
    status: response.status,
    body: (await response.json()) as {
      result?: Record<string, unknown>;
      error?: { code: string; detail?: Record<string, unknown> };
    },
  };
}

async function thread(uid: string): Promise<string> {
  const id = randomUUID();
  await harness.pool.query(
    "INSERT INTO guide_threads (id, user_id, mode) VALUES ($1, $2, 'private')",
    [id, uid],
  );
  return id;
}

async function spendToday(uid: string, count: number): Promise<Date> {
  const resetAt = new Date(Date.now() + 5 * 3_600_000);
  await harness.pool.query(
    `INSERT INTO usage_counters (subject_kind, subject_id, metric, period_key, count, limit_at_time, reset_at)
     VALUES ('user', $1, 'guide_answers', '2026-09-30', $2, 30, $3)`,
    [uid, count, resetAt],
  );
  return resetAt;
}

describe('queue_guide_question', () => {
  it('waits for the reset only when the free answers are spent, once a day', async () => {
    const me = await harness.signInAnonymously();
    const threadId = await thread(me.uid);
    const ask = { thread_id: threadId, text: 'Where is good for sunrise tomorrow?' };

    expect((await send(me, 'queue_guide_question', ask)).body.error).toMatchObject({
      code: 'STATE_INVALID',
    });

    const resetAt = await spendToday(me.uid, 30);
    const queued = await send(me, 'queue_guide_question', ask);
    expect(queued.status).toBe(200);
    expect(queued.body.result?.['answer_after']).toBe(resetAt.toISOString());
    const row = await harness.pool.query(
      'SELECT tz, queued_for, status FROM queued_guide_questions WHERE user_id = $1',
      [me.uid],
    );
    expect(row.rows).toEqual([
      { tz: 'Asia/Ho_Chi_Minh', queued_for: '2026-09-30', status: 'queued' },
    ]);

    const second = await send(me, 'queue_guide_question', ask);
    expect(second.body.error).toMatchObject({
      code: 'STATE_INVALID',
      detail: { state: 'already_queued' },
    });

    const cancelled = await send(me, 'cancel_queued_question', {
      question_id: queued.body.result?.['question_id'],
    });
    expect(cancelled.body.result).toMatchObject({ status: 'cancelled' });
    expect((await send(me, 'queue_guide_question', ask)).status).toBe(200);
  });

  it('never queues into someone else’s thread', async () => {
    const owner = await harness.signInAnonymously();
    const other = await harness.signInAnonymously();
    const threadId = await thread(owner.uid);
    await spendToday(other.uid, 30);
    const result = await send(other, 'queue_guide_question', { thread_id: threadId, text: 'hi' });
    expect(result.body.error).toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('rate_guide_answer', () => {
  it('keeps the verdict on the answer', async () => {
    const me = await harness.signInAnonymously();
    const threadId = await thread(me.uid);
    const { rows } = await harness.pool.query<{ id: string }>(
      "INSERT INTO guide_messages (thread_id, role, content) VALUES ($1, 'guide', 'Try the market.') RETURNING id",
      [threadId],
    );
    const rated = await send(me, 'rate_guide_answer', { message_id: rows[0]!.id, verdict: 'down' });
    expect(rated.status).toBe(200);
    const stored = await harness.pool.query('SELECT rating FROM guide_messages WHERE id = $1', [
      rows[0]!.id,
    ]);
    expect(stored.rows).toEqual([{ rating: 'down' }]);
  });
});
