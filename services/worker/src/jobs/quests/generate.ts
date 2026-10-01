/**
 * `quests.generate`: one trip day's crew quests. The guide proposes from the registered templates,
 * the validator keeps what resolves against the day, deterministic quests fill the day to three,
 * and the rows publish with `quest.published` (the evening roundup's "quests are up" line). A day
 * that already has quests is never written twice; the model call runs outside any transaction.
 */
import {
  fallbackQuests,
  personaIdSchema,
  recordUsage,
  writeQuests,
  type AiUsageRecord,
  type Gateway,
  type PersonaId,
  type QuestsPromptInput,
  type QuestsResult,
} from '@cp/ai';
import { appendDomainEvent, withSystem } from '@cp/db';
import {
  localSchedule,
  QUEST_QUEUES,
  questGenerateJobSchema,
  type QuestGenerateJob,
  type ValidQuest,
} from '@cp/domain';
import type pg from 'pg';

import { defineJob, type AnyJobDefinition } from '../../boss';
import { dayBounds, firstDayArrival, loadQuestDay, questTrip, type QuestTrip } from './day-context';
import { registeredQuestTemplates } from './templates/registry';

export type QuestWriter = (
  onUsage: (record: AiUsageRecord) => Promise<void>,
) => Pick<Gateway, 'callModel'>;

export interface GenerateOptions {
  readonly writer?: QuestWriter | undefined;
  readonly now?: Date;
}

export interface GenerateOutcome {
  readonly outcome: 'not_travelling' | 'already_published' | 'published';
  readonly quests?: number;
  readonly fromGuide?: number;
}

function persona(slug: string | null): PersonaId {
  const parsed = personaIdSchema.safeParse(slug);
  return parsed.success ? parsed.data : 'guest';
}

function endsAt(quest: ValidQuest, trip: QuestTrip, localDate: string, dayEnd: Date): Date {
  if (quest.deadline === null) return dayEnd;
  return localSchedule({ date: localDate, time: quest.deadline, tz: trip.tz });
}

async function publish(
  tx: pg.PoolClient,
  trip: QuestTrip,
  localDate: string,
  result: QuestsResult,
  now: Date,
  arrival: Date | null,
): Promise<string[] | null> {
  const existing = await tx.query(
    'SELECT 1 FROM quests WHERE trip_id = $1 AND local_date = $2 LIMIT 1 FOR UPDATE',
    [trip.id, localDate],
  );
  if ((existing.rowCount ?? 0) > 0) return null;
  const { end } = dayBounds(localDate, trip.tz);
  const ids: string[] = [];
  for (const [slot, quest] of result.quests.entries()) {
    const ends = endsAt(quest, trip, localDate, end);
    // A deadline already behind us (a late first run), or before the crew lands on the first
    // day, cannot be met today.
    if (ends.getTime() <= Math.max(now.getTime(), arrival?.getTime() ?? 0)) continue;
    const source = slot < result.fromGuide ? 'guide' : 'fallback';
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO quests (trip_id, local_date, slot, template, params, metric, target, reward,
         title, body, source, starts_at, ends_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (trip_id, local_date, slot) DO NOTHING
       RETURNING id`,
      [
        trip.id,
        localDate,
        ids.length,
        quest.template,
        JSON.stringify(quest.params),
        quest.metric,
        quest.target,
        JSON.stringify(quest.reward),
        quest.title,
        quest.desc,
        source,
        now,
        ends,
      ],
    );
    const id = rows[0]?.id;
    if (id === undefined) continue;
    await tx.query('INSERT INTO quest_progress (quest_id, trip_id) VALUES ($1, $2)', [id, trip.id]);
    ids.push(id);
  }
  if (ids.length === 0) return ids;
  await appendDomainEvent(tx, {
    type: 'quest.published',
    aggregateKind: 'trip',
    aggregateId: trip.id,
    actorKind: 'system',
    actorId: null,
    crewId: trip.crew_id,
    tripId: trip.id,
    payload: {
      trip_id: trip.id,
      local_date: localDate,
      quest_ids: ids,
      fallback_used: result.fallbackUsed,
    },
  });
  return ids;
}

export async function generateQuests(
  pool: pg.Pool,
  job: QuestGenerateJob,
  options: GenerateOptions = {},
): Promise<GenerateOutcome> {
  const now = options.now ?? new Date();
  const setup = await withSystem(pool, async (tx) => {
    const trip = await questTrip(tx, job.trip_id, job.local_date);
    if (trip === undefined) return null;
    const done = await tx.query('SELECT 1 FROM quests WHERE trip_id = $1 AND local_date = $2', [
      trip.id,
      job.local_date,
    ]);
    const arrival = await firstDayArrival(tx, trip, job.local_date);
    return { trip, arrival, done: (done.rowCount ?? 0) > 0 };
  });
  if (setup === null) return { outcome: 'not_travelling' };
  if (setup.done) return { outcome: 'already_published' };
  const { trip, arrival } = setup;
  const input: QuestsPromptInput = {
    guide: persona(trip.guide_slug),
    place: trip.place,
    day: await loadQuestDay(pool, trip, job.local_date, arrival),
    templates: registeredQuestTemplates(),
  };
  const gateway = options.writer?.((record) => recordUsage((fn) => withSystem(pool, fn), record));
  const result =
    gateway === undefined
      ? fallbackQuests(input, ['not_configured'])
      : await writeQuests(gateway, input, { tripId: trip.id });
  const ids = await withSystem(pool, (tx) =>
    publish(tx, trip, job.local_date, result, now, arrival),
  );
  if (ids === null) return { outcome: 'already_published' };
  return { outcome: 'published', quests: ids.length, fromGuide: result.fromGuide };
}

export function generateQuestsJob(writer?: QuestWriter): AnyJobDefinition {
  return defineJob({
    queue: QUEST_QUEUES.generate,
    schema: questGenerateJobSchema,
    singletonKey: (data) => `${data.trip_id}:${data.local_date}`,
    handler: async (data, { pool }) => ({ ...(await generateQuests(pool, data, { writer })) }),
  });
}
