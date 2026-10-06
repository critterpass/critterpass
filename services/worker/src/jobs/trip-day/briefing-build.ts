/**
 * `briefing.build`: one member's morning briefing for one trip day. The candidates are computed
 * from facts; the guide words at most three, and the template lines stand in when the model is not
 * configured, fails or answers out of bounds (`fallback_used`). The first run of a day appends
 * `briefing.built`, whose push goes out once; every run arms the member's next morning.
 */
import {
  personaIdSchema,
  recordUsage,
  templateBriefing,
  writeBriefing,
  type AiUsageRecord,
  type BriefingResult,
  type Gateway,
  type PersonaId,
} from '@cp/ai';
import {
  appendDomainEvent,
  scheduledJobDataSchema,
  withSystem,
  type ScheduledJobData,
} from '@cp/db';
import { TRIP_DAY_QUEUES, type BriefingLine } from '@cp/domain';
import type pg from 'pg';

import { defineJob, type JobDefinition } from '../../boss';
import { dayGuide } from '../quests/day-context';
import { briefingCandidates } from './briefing-candidates';
import {
  armNextBriefing,
  briefingParticipant,
  briefingZone,
  type BriefingParticipant,
} from './briefing-schedule';

export type BriefingWriter = (
  onUsage: (record: AiUsageRecord) => Promise<void>,
) => Pick<Gateway, 'callModel'>;

/** The briefing of a day is in that day's guide's voice. */
async function personaOfDay(
  tx: pg.PoolClient,
  tripId: string,
  localDate: string,
): Promise<PersonaId> {
  const parsed = personaIdSchema.safeParse((await dayGuide(tx, tripId, localDate))?.slug);
  return parsed.success ? parsed.data : 'guest';
}

async function insertLine(
  tx: pg.PoolClient,
  briefingId: string,
  row: BriefingParticipant,
  position: number,
  line: BriefingLine,
): Promise<void> {
  await tx.query(
    `INSERT INTO briefing_items (briefing_id, trip_id, user_id, position, icon, text, action,
       target_user_ids, deep_link, facts, source, dedupe_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'daily_job', $11)
     ON CONFLICT (briefing_id, dedupe_key) DO NOTHING`,
    [
      briefingId,
      row.trip_id,
      row.user_id,
      position,
      line.icon,
      line.text,
      line.candidate.action,
      line.candidate.target_user_ids,
      line.candidate.deep_link,
      JSON.stringify(line.candidate.facts),
      line.candidate.dedupe_key,
    ],
  );
}

/** Stores the day's briefing once; resolves to its id, or null when the day was already built. */
async function store(
  tx: pg.PoolClient,
  row: BriefingParticipant,
  localDate: string,
  result: BriefingResult,
): Promise<string | null> {
  // A briefing an event item created ahead of the morning is filled in, not duplicated.
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO briefings (trip_id, user_id, local_date, tz, status, fallback_used, built_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (trip_id, user_id, local_date) DO UPDATE
       SET status = EXCLUDED.status, fallback_used = EXCLUDED.fallback_used, built_at = now()
       WHERE briefings.built_at IS NULL
     RETURNING id`,
    [
      row.trip_id,
      row.user_id,
      localDate,
      briefingZone(row, localDate),
      result.lines.length === 0 ? 'empty' : 'ready',
      result.fallbackUsed,
    ],
  );
  const briefingId = rows[0]?.id;
  if (briefingId === undefined) return null;
  for (const [position, line] of result.lines.entries()) {
    await insertLine(tx, briefingId, row, position, line);
  }
  return briefingId;
}

export interface BriefingRunOptions {
  readonly writer?: BriefingWriter | undefined;
  readonly now?: Date;
}

export async function runBriefing(
  pool: pg.Pool,
  participantId: string,
  localDate: string,
  options: BriefingRunOptions = {},
): Promise<{ outcome: string }> {
  const now = options.now ?? new Date();
  const setup = await withSystem(pool, async (tx) => {
    const row = await briefingParticipant(tx, participantId);
    if (row === undefined) return null;
    const built = await tx.query(
      `SELECT 1 FROM briefings
        WHERE trip_id = $1 AND user_id = $2 AND local_date = $3 AND built_at IS NOT NULL`,
      [row.trip_id, row.user_id, localDate],
    );
    if (built.rows.length > 0) return { row, candidates: [], persona: null };
    const tz = briefingZone(row, localDate);
    const scope = { tripId: row.trip_id, userId: row.user_id, localDate, tz, now };
    const candidates = await briefingCandidates(tx, scope);
    return { row, candidates, persona: await personaOfDay(tx, row.trip_id, localDate) };
  });
  if (setup === null) return { outcome: 'not_going' };
  const { row, candidates, persona } = setup;
  if (persona === null) {
    await withSystem(pool, (tx) => armNextBriefing(tx, participantId, now));
    return { outcome: 'already_built' };
  }
  // The model call runs outside any transaction; storing is its own short one.
  const gateway = options.writer?.((record) => recordUsage((fn) => withSystem(pool, fn), record));
  const result: BriefingResult =
    gateway === undefined
      ? { lines: templateBriefing(candidates), fallbackUsed: candidates.length > 0 }
      : await writeBriefing(
          gateway,
          { guide: persona, localDate, candidates },
          { userId: row.user_id, tripId: row.trip_id },
        );
  return withSystem(pool, async (tx) => {
    const briefingId = await store(tx, row, localDate, result);
    if (briefingId !== null) {
      await appendDomainEvent(tx, {
        type: 'briefing.built',
        aggregateKind: 'briefing',
        aggregateId: briefingId,
        actorKind: 'system',
        actorId: null,
        tripId: row.trip_id,
        payload: {
          trip_id: row.trip_id,
          user_id: row.user_id,
          briefing_id: briefingId,
          item_count: result.lines.length,
          fallback_used: result.fallbackUsed,
        },
      });
    }
    await armNextBriefing(tx, participantId, now);
    if (result.lines.length === 0) return { outcome: 'empty' };
    return { outcome: result.fallbackUsed ? 'template' : 'model' };
  });
}

export function briefingJob(writer?: BriefingWriter): JobDefinition<ScheduledJobData> {
  return defineJob({
    queue: TRIP_DAY_QUEUES.briefing,
    schema: scheduledJobDataSchema,
    singletonKey: (data: ScheduledJobData) => `${data.ref_id}:${String(data.data['local_date'])}`,
    handler: (data, ctx) => {
      const localDate = data.data['local_date'];
      const date = typeof localDate === 'string' ? localDate : data.due_at.slice(0, 10);
      return runBriefing(ctx.pool, data.ref_id, date, { writer });
    },
  });
}
