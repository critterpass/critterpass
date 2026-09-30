/**
 * `quest.evaluate`: one consumed event, applied once. It grants the XP the event itself is worth
 * (a first visit to a place, the crew settling up), then moves every live quest of the trip whose
 * template consumes the event: the matcher names what the event counts, progress is the number of
 * distinct things counted, and `source_event_ids` makes a repeated event a no-op. A quest that
 * reaches its count finishes through `app.grant_quest_reward` (once, under the quest's row lock),
 * and every phone spins the reward at the shared `reveal_at`.
 */
import { appendDomainEvent, outbox, withSystem } from '@cp/db';
import {
  channelName,
  QUEST_QUEUES,
  QUESTS_RT,
  questEvaluateJobSchema,
  revealAt,
  type QuestRewardHint,
} from '@cp/domain';
import type pg from 'pg';

import { defineJob, type AnyJobDefinition } from '../../boss';
import { settleXp } from '../rewards/handlers/settle-xp';
import { announceXp, visitXp } from '../rewards/handlers/xp';
import { questConsumes, questMatcher, type QuestEvent, type QuestRow } from './templates/registry';

interface ProgressRow {
  readonly value: number;
  readonly counted: string[];
  readonly source_event_ids: string[];
}

async function loadEvent(tx: pg.PoolClient, id: string): Promise<QuestEvent | undefined> {
  const { rows } = await tx.query<QuestEvent>(
    'SELECT id, type, trip_id, payload, occurred_at FROM app.domain_event_for_routing($1)',
    [id],
  );
  return rows[0];
}

/** Who counts for a quest: the travellers still on the trip, or those of them who signed up. */
async function audience(tx: pg.PoolClient, questId: string, tripId: string): Promise<Set<string>> {
  const { rows } = await tx.query<{ user_id: string }>(
    `SELECT p.user_id FROM trip_participants p JOIN quests q ON q.trip_id = p.trip_id
      WHERE q.id = $1 AND p.trip_id = $2 AND p.rsvp NOT IN ('out', 'waitlisted')
        AND (q.scope = 'crew' OR EXISTS (
          SELECT 1 FROM quest_signups s WHERE s.quest_id = q.id AND s.user_id = p.user_id))`,
    [questId, tripId],
  );
  return new Set(rows.map((row) => row.user_id));
}

export async function completeQuest(
  tx: pg.PoolClient,
  quest: QuestRow,
  users: readonly string[],
  now: Date,
): Promise<boolean> {
  const reveal = revealAt(now);
  const { rows } = await tx.query<{
    completed: boolean;
    crew_id: string;
    xp: number;
    user_ids: string[];
    level_before: number | null;
    level_after: number | null;
    sticker_ids: string[];
  }>('SELECT * FROM app.grant_quest_reward($1, $2::uuid[], $3, $4)', [
    quest.id,
    [...users].sort(),
    now,
    reveal,
  ]);
  const done = rows[0];
  if (done === undefined || !done.completed) return false;
  await appendDomainEvent(tx, {
    type: 'quest.completed',
    aggregateKind: 'quest',
    aggregateId: quest.id,
    actorKind: 'system',
    actorId: null,
    crewId: done.crew_id,
    tripId: quest.trip_id,
    payload: {
      trip_id: quest.trip_id,
      quest_id: quest.id,
      user_ids: done.user_ids,
      xp: done.xp,
      reveal_at: reveal.toISOString(),
    },
  });
  const grant = {
    crewId: done.crew_id,
    tripId: quest.trip_id,
    userIds: done.user_ids,
    amount: done.xp,
    sourceKind: 'quest' as const,
    sourceId: quest.id,
    at: now,
  };
  await announceXp(tx, grant, {
    granted: true,
    levelBefore: done.level_before,
    levelAfter: done.level_after,
    stickerIds: done.sticker_ids,
  });
  const channel = channelName('trip_quests', quest.trip_id);
  await outbox(tx, channel, QUESTS_RT.completed, { quest_id: quest.id });
  const hint: QuestRewardHint = {
    kind: 'quest',
    quest_id: quest.id,
    sticker_id: null,
    xp: done.xp,
    level: done.level_after,
    reveal_at: reveal.toISOString(),
  };
  await outbox(tx, channel, QUESTS_RT.reward, hint);
  return true;
}

async function applyToQuest(
  tx: pg.PoolClient,
  quest: QuestRow,
  event: QuestEvent,
  now: Date,
): Promise<'skipped' | 'moved' | 'completed'> {
  const match = questMatcher(quest.template);
  if (match === undefined || !questConsumes(quest.template, event.type)) return 'skipped';
  const { rows } = await tx.query<ProgressRow>(
    `INSERT INTO quest_progress (quest_id, trip_id) VALUES ($1, $2)
     ON CONFLICT (quest_id) DO UPDATE SET quest_id = EXCLUDED.quest_id
     RETURNING value, counted, source_event_ids`,
    [quest.id, quest.trip_id],
  );
  const progress = rows[0];
  if (progress === undefined || progress.source_event_ids.includes(event.id)) return 'skipped';
  const people = await audience(tx, quest.id, quest.trip_id);
  const result = await match({ tx, quest, event, audience: people });
  const counted = new Set(progress.counted);
  if (result !== null && 'key' in result) counted.add(result.key);
  // A crew quest counts against who is still travelling (a dropped traveller lowers the bar).
  const goal = quest.template === 'copresence' ? Math.min(quest.target, people.size) : quest.target;
  const complete = result !== null && 'complete' in result;
  const value = complete ? quest.target : Math.min(counted.size, quest.target);
  await tx.query(
    `UPDATE quest_progress SET value = $2, counted = $3, updated_at = now(),
       source_event_ids = array_append(source_event_ids, $4)
     WHERE quest_id = $1`,
    [quest.id, value, [...counted].sort(), event.id],
  );
  if (value !== progress.value) {
    await outbox(tx, channelName('trip_quests', quest.trip_id), QUESTS_RT.progress, {
      quest_id: quest.id,
      value,
      target: quest.target,
    });
    await appendDomainEvent(tx, {
      type: 'quest.progress',
      aggregateKind: 'quest',
      aggregateId: quest.id,
      actorKind: 'system',
      actorId: null,
      tripId: quest.trip_id,
      payload: { trip_id: quest.trip_id, quest_id: quest.id, value, target: quest.target },
    });
  }
  if (complete || (goal > 0 && counted.size >= goal)) {
    return (await completeQuest(tx, quest, [...people], now)) ? 'completed' : 'moved';
  }
  return value === progress.value ? 'skipped' : 'moved';
}

export interface EvaluateOutcome {
  readonly xp: boolean;
  readonly moved: number;
  readonly completed: number;
}

export async function evaluateEvent(
  pool: pg.Pool,
  eventId: string,
  now: Date = new Date(),
): Promise<EvaluateOutcome> {
  return withSystem(pool, async (tx) => {
    const event = await loadEvent(tx, eventId);
    if (event?.trip_id == null) return { xp: false, moved: 0, completed: 0 };
    let xp = false;
    if (event.type === 'visit.recorded') xp = await visitXp(tx, event);
    if (event.type === 'trip.settled') xp = await settleXp(tx, event);
    const { rows: quests } = await tx.query<QuestRow>(
      `SELECT q.id, q.trip_id, q.template, q.params, q.target, q.starts_at, q.ends_at,
              (q.local_date::timestamp AT TIME ZONE coalesce(t.tz, d.tz, 'UTC')) AS day_start
         FROM quests q JOIN trips t ON t.id = q.trip_id
         LEFT JOIN destinations d ON d.id = t.destination_id
        WHERE q.trip_id = $1 AND q.status IN ('offered', 'active') AND q.ends_at > $2
        ORDER BY q.local_date, q.slot
        FOR UPDATE OF q`,
      [event.trip_id, event.occurred_at],
    );
    let moved = 0;
    let completed = 0;
    for (const quest of quests) {
      const outcome = await applyToQuest(tx, quest, event, now);
      if (outcome === 'moved') moved += 1;
      if (outcome === 'completed') completed += 1;
    }
    return { xp, moved, completed };
  });
}

export function evaluateJob(): AnyJobDefinition {
  return defineJob({
    queue: QUEST_QUEUES.evaluate,
    schema: questEvaluateJobSchema,
    singletonKey: (data) => data.event_id,
    handler: async (data, { pool }) => ({ ...(await evaluateEvent(pool, data.event_id)) }),
  });
}
