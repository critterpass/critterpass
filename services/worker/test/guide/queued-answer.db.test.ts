/**
 * `ai.queued_answer` on a fake clock: a question queued in Asia/Saigon waits past 00:00 UTC and is
 * answered at 00:00 Saigon time, counted toward the new day, placed in its thread after the
 * question, and announced by the passive push's event.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { queuedAnswerJob } from '../../src/jobs/guide/queued-answer';
import { insertUser, startNotifyDb, type NotifyDb } from '../notify-fixtures';
import { fakeModel, jobContext, testRuntime } from './guide-fixtures';

let db: NotifyDb;

beforeAll(async () => {
  db = await startNotifyDb();
}, 240_000);

afterAll(async () => {
  await db?.stop();
});

// Midnight in Asia/Saigon (UTC+7) on 2 October is 17:00 UTC on 1 October.
const SAIGON_MIDNIGHT = new Date('2026-10-01T17:00:00Z');
const UTC_MIDNIGHT = new Date('2026-10-01T00:00:00Z');

describe('ai.queued_answer', () => {
  it('answers at 00:00 in the queued zone, not at 00:00 UTC, on the new day', async () => {
    const uid = await insertUser(db.pool);
    const threadId = randomUUID();
    await db.pool.query(
      "INSERT INTO guide_threads (id, user_id, mode) VALUES ($1, $2, 'private')",
      [threadId, uid],
    );
    // Yesterday's spent day, started when the first question of it was asked.
    await db.pool.query(
      `INSERT INTO usage_counters (subject_kind, subject_id, metric, period_key, count, limit_at_time, reset_at, started_at)
       VALUES ('user', $1, 'guide_answers', '2026-10-01', 30, 30, $2, now() - interval '21 hours')`,
      [uid, SAIGON_MIDNIGHT],
    );
    const { rows } = await db.pool.query<{ id: string }>(
      `INSERT INTO queued_guide_questions (user_id, thread_id, text, tz, queued_for, answer_after, queued_at)
       VALUES ($1, $2, 'Is the night market open tomorrow?', 'Asia/Saigon', '2026-10-01', $3, $4) RETURNING id`,
      [uid, threadId, SAIGON_MIDNIGHT, new Date('2026-10-01T15:00:00Z')],
    );
    const questionId = rows[0]!.id;
    const model = fakeModel(() => 'Yes, from 17:00 by the river.');

    let now = UTC_MIDNIGHT;
    const job = queuedAnswerJob(testRuntime(db.pool, model), () => now);
    expect(await job.handler({}, jobContext)).toEqual({ answered: 0, waiting: 0, failed: 0 });
    expect(model.requests).toHaveLength(0);

    now = SAIGON_MIDNIGHT;
    expect(await job.handler({}, jobContext)).toEqual({ answered: 1, waiting: 0, failed: 0 });
    const request = JSON.stringify(model.requests[0]);
    expect(request).toContain('asked last night');

    const question = await db.pool.query<{ status: string; answer_message_id: string }>(
      'SELECT status, answer_message_id FROM queued_guide_questions WHERE id = $1',
      [questionId],
    );
    expect(question.rows[0]?.status).toBe('answered');
    const thread = await db.pool.query<{ role: string; content: string; meter_counted: boolean }>(
      'SELECT role, content, meter_counted FROM guide_messages WHERE thread_id = $1 ORDER BY created_at',
      [threadId],
    );
    expect(thread.rows).toEqual([
      { role: 'user', content: 'Is the night market open tomorrow?', meter_counted: false },
      { role: 'guide', content: 'Yes, from 17:00 by the river.', meter_counted: true },
    ]);
    const days = await db.pool.query<{ period_key: string; count: number }>(
      'SELECT period_key, count FROM usage_counters WHERE subject_id = $1 ORDER BY period_key',
      [uid],
    );
    expect(days.rows).toEqual([
      { period_key: '2026-10-01', count: 30 },
      { period_key: '2026-10-02', count: 1 },
    ]);
    const events = await db.pool.query(
      "SELECT 1 FROM domain_events WHERE type = 'guide.question_answered' AND aggregate_id = $1",
      [questionId],
    );
    expect(events.rowCount).toBe(1);

    // Answered once: the next run finds nothing due.
    expect(await job.handler({}, jobContext)).toEqual({ answered: 0, waiting: 0, failed: 0 });
  });
});
