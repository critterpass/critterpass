/**
 * `ai.queued_answer` (docs/api-contracts-async.md §2.2): every 15 minutes, the questions whose
 * meter reset has come (00:00 in the zone they were queued in) are answered. Each answer counts
 * toward the new day's free answers, lands in its thread after the question, and sends the
 * passive `queued_answer` push; the morning briefing reads the row's status. A question the new
 * day cannot pay for waits for the next run; a failed answer is marked failed.
 */
import {
  buildContext,
  buildGuideChatRequest,
  GUIDE_CHAT_ROUTE,
  packFor,
  runTurn,
  type GuideHistoryTurn,
} from '@cp/ai';
import { emitEvent, withSystem } from '@cp/db';
import {
  DomainError,
  GUIDE_QUEUES,
  QUEUED_ANSWER_BODY,
  QUEUED_ANSWER_TITLE,
  queuedAnswerJobSchema,
} from '@cp/domain';

import { defineJob } from '../../boss';
import { privacyRedactionKeys } from '../../obs/logger';
import { registerNotification } from '../notify/register';
import { reserveGuideAnswer } from './meter';
import { guideReader, type GuideRuntime } from './runtime';

/** Questions answered per run; the rest wait 15 minutes. */
export const QUEUED_ANSWER_BATCH = 50;

interface DueQuestion {
  readonly id: string;
  readonly user_id: string;
  readonly thread_id: string;
  readonly trip_id: string | null;
  readonly text: string;
  readonly tz: string;
  readonly queued_at: Date;
  readonly guide_slug: string | null;
}

async function dueQuestions(runtime: GuideRuntime, now: Date): Promise<DueQuestion[]> {
  const { rows } = await withSystem(runtime.pool, (tx) =>
    tx.query<DueQuestion>(
      `SELECT q.id, q.user_id, q.thread_id, q.trip_id, q.text, q.tz, q.queued_at, g.slug AS guide_slug
         FROM queued_guide_questions q
         LEFT JOIN trips t ON t.id = q.trip_id
         LEFT JOIN guides g ON g.id = t.guide_id
        WHERE q.status = 'queued' AND q.answer_after <= $1
        ORDER BY q.answer_after, q.id
        LIMIT $2`,
      [now, QUEUED_ANSWER_BATCH],
    ),
  );
  return rows;
}

async function history(runtime: GuideRuntime, q: DueQuestion): Promise<GuideHistoryTurn[]> {
  return guideReader(runtime.pool)(q.user_id, q.trip_id, async (tx) => {
    await tx.query("SELECT set_config('app.thread', $1, true)", [q.thread_id]);
    const { rows } = await tx.query<GuideHistoryTurn>(
      'SELECT role, content FROM llm.guide_history ORDER BY created_at DESC LIMIT 24',
    );
    return rows.reverse();
  });
}

type Outcome = 'answered' | 'waiting' | 'failed';

export async function answerQueuedQuestion(
  runtime: GuideRuntime,
  q: DueQuestion,
  now: Date,
): Promise<Outcome> {
  let meter;
  try {
    meter = await reserveGuideAnswer(runtime.pool, {
      uid: q.user_id,
      tz: q.tz,
      tripId: q.trip_id,
      isCrewChat: false,
      crewPassHolders: [],
      now,
    });
  } catch (error) {
    if (error instanceof DomainError && error.code === 'QUOTA_EXHAUSTED') return 'waiting';
    throw error;
  }
  const read = guideReader(runtime.pool);
  const [pack, context, past] = await Promise.all([
    packFor(read, q.user_id, q.trip_id, q.guide_slug),
    buildContext(
      { uid: q.user_id, tripId: q.trip_id, surface: 'C' },
      { runAsGuideReader: read, redactKeys: privacyRedactionKeys() },
    ),
    history(runtime, q),
  ]);
  const request = buildGuideChatRequest({
    pack,
    tripContext: context.tripContext,
    history: past,
    question: q.text,
    directives: { chattiness: context.prefs.chattiness, locale: context.prefs.locale ?? 'en' },
    queued: true,
  });
  let text = '';
  let sources: readonly string[] = [];
  let finished = false;
  for await (const event of runTurn(
    {
      route: GUIDE_CHAT_ROUTE,
      system: request.system,
      messages: request.messages,
      tool: { uid: q.user_id, tripId: q.trip_id, caller: 'C' },
      usage: { userId: q.user_id, tripId: q.trip_id },
    },
    { gateway: runtime.gateway, registry: runtime.registry, meter },
  )) {
    if (event.type === 'token') text += event.text;
    if (event.type === 'done') {
      sources = event.sources;
      finished = true;
    }
  }
  await withSystem(runtime.pool, async (tx) => {
    if (!finished) {
      await tx.query("UPDATE queued_guide_questions SET status = 'failed' WHERE id = $1", [q.id]);
      return;
    }
    await tx.query(
      `INSERT INTO guide_messages (thread_id, trip_id, role, author_id, content, created_at)
       VALUES ($1, $2, 'user', $3, $4, $5)`,
      [q.thread_id, q.trip_id, q.user_id, q.text, q.queued_at],
    );
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO guide_messages (thread_id, trip_id, role, content, sources, meter_counted, created_at)
       VALUES ($1, $2, 'guide', $3, $4, $5, $6) RETURNING id`,
      [
        q.thread_id,
        q.trip_id,
        text.slice(0, 8000),
        JSON.stringify(sources.map((url) => ({ url }))),
        meter.reservation.metered,
        now,
      ],
    );
    const messageId = rows[0]?.id as string;
    await tx.query(
      `UPDATE queued_guide_questions
          SET status = 'answered', answer_message_id = $2, answered_at = now() WHERE id = $1`,
      [q.id, messageId],
    );
    await tx.query('UPDATE guide_threads SET last_message_at = now() WHERE id = $1', [q.thread_id]);
    await emitEvent(tx, {
      type: 'guide.question_answered',
      aggregateKind: 'queued_guide_question',
      aggregateId: q.id,
      actorKind: 'guide',
      actorId: null,
      tripId: q.trip_id,
      payload: {
        question_id: q.id,
        user_id: q.user_id,
        thread_id: q.thread_id,
        message_id: messageId,
        trip_id: q.trip_id,
      },
    });
  });
  return finished ? 'answered' : 'failed';
}

let pushesRegistered = false;

/** The N-36 passive push to the person who queued the question, opening their thread. */
export function registerQueuedAnswerPush(): void {
  if (pushesRegistered) return;
  pushesRegistered = true;
  registerNotification({
    key: 'queued_answer',
    event: 'guide.question_answered',
    audience: (_tx, event) => {
      const uid = event.payload['user_id'];
      return Promise.resolve(typeof uid === 'string' ? [uid] : []);
    },
    async compose(tx, event, uid) {
      const threadId = event.payload['thread_id'];
      if (typeof threadId !== 'string' || event.payload['user_id'] !== uid) return null;
      const { rows } = await tx.query<{ id: string; name: string }>(
        `SELECT g.id, g.name FROM guide_threads th
           LEFT JOIN trips t ON t.id = th.trip_id
           JOIN guides g ON g.id = coalesce(th.guide_id, t.guide_id)
          WHERE th.id = $1`,
        [threadId],
      );
      const guide = rows[0] ?? { id: 'guide', name: 'Your guide' };
      return {
        title: QUEUED_ANSWER_TITLE,
        body: QUEUED_ANSWER_BODY,
        vars: { guide: guide.name },
        sender: { kind: 'guide', id: guide.id, name: guide.name },
        tripId: event.tripId,
        deepLink: `/guide/${threadId}`,
        ctx: { message_id: event.payload['message_id'] },
      };
    },
  });
}

export function queuedAnswerJob(runtime: GuideRuntime, clock: () => Date = () => new Date()) {
  registerQueuedAnswerPush();
  return defineJob({
    queue: GUIDE_QUEUES.queuedAnswer,
    schema: queuedAnswerJobSchema,
    async handler() {
      const now = clock();
      const counts: Record<Outcome, number> = { answered: 0, waiting: 0, failed: 0 };
      for (const question of await dueQuestions(runtime, now)) {
        counts[await answerQueuedQuestion(runtime, question, now)] += 1;
      }
      return counts;
    },
  });
}
