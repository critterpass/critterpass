/**
 * `explore.place_qna_summary` (docs/api-contracts-async.md §2): the crew's one-line Q&A snippet on
 * a place page, summarised from the latest messages of THIS trip's crew chat that name the place
 * (a place card shared in chat, or its name in the text). Keyed (trip, place) under trip RLS, so a
 * crew never reads another crew's line about the same place. Nothing but the chat lines and the
 * place's name reaches the model; a rejected reply keeps the previous line (or none).
 */
import {
  PLACE_QNA_MESSAGES,
  recordUsage,
  summarisePlaceQna,
  type AiUsageRecord,
  type Gateway,
  type PlaceQnaMessage,
} from '@cp/ai';
import { withSystem } from '@cp/db';
import { EXPLORE_QUEUES, placeQnaJobSchema, type PlaceQnaJob } from '@cp/domain';
import type pg from 'pg';

import { defineJob, type JobDefinition } from '../../boss';

export type PlaceQnaWriter = (
  onUsage: (record: AiUsageRecord) => Promise<void>,
) => Pick<Gateway, 'callModel'>;

interface MentionRow {
  readonly id: string;
  readonly author: string | null;
  readonly body: string;
  readonly created_at: Date;
}

export type PlaceQnaOutcome = 'no_mentions' | 'up_to_date' | 'no_writer' | 'rejected' | 'stored';

/** The latest chat lines of the trip's crew that name the place, oldest first. */
export async function placeMentions(
  tx: pg.PoolClient,
  tripId: string,
  poiId: string,
): Promise<{ placeName: string; messages: PlaceQnaMessage[]; latestAt: Date | null }> {
  const place = (
    await tx.query<{ name: string; name_local: string | null }>(
      'SELECT name, name_local FROM pois WHERE id = $1',
      [poiId],
    )
  ).rows[0];
  if (place === undefined) return { placeName: '', messages: [], latestAt: null };
  const { rows } = await tx.query<MentionRow>(
    `SELECT m.id, split_part(u.display_name, ' ', 1) AS author, m.body, m.created_at
       FROM messages m
       JOIN trips t ON t.id = m.trip_id AND t.crew_id = m.crew_id
       LEFT JOIN users u ON u.id = m.sender_id
      WHERE m.trip_id = $1 AND m.sender_kind = 'user' AND m.type = 'text'
        AND m.deleted_at IS NULL AND m.hidden_at IS NULL AND m.body <> ''
        AND ((m.ref_kind = 'poi' AND m.ref_id = $2)
             OR strpos(lower(m.body), lower($3)) > 0
             OR ($4::text IS NOT NULL AND strpos(lower(m.body), lower($4)) > 0))
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT $5`,
    [tripId, poiId, place.name, place.name_local, PLACE_QNA_MESSAGES],
  );
  const messages = rows.reverse().map((row) => ({
    id: row.id,
    author: row.author ?? 'a crew member',
    text: row.body,
    at: row.created_at.toISOString(),
  }));
  return { placeName: place.name, messages, latestAt: rows[0]?.created_at ?? null };
}

export async function runPlaceQna(
  pool: pg.Pool,
  job: PlaceQnaJob,
  writer: PlaceQnaWriter | undefined,
): Promise<PlaceQnaOutcome> {
  const found = await withSystem(pool, async (tx) => {
    const input = await placeMentions(tx, job.trip_id, job.poi_id);
    const last = input.messages.at(-1);
    if (last === undefined) return { kind: 'no_mentions' as const };
    const stored = await tx.query(
      'SELECT 1 FROM place_qna_summaries WHERE trip_id = $1 AND poi_id = $2 AND source_message_id = $3',
      [job.trip_id, job.poi_id, last.id],
    );
    if (stored.rows.length > 0) return { kind: 'up_to_date' as const };
    return { kind: 'input' as const, input };
  });
  if (found.kind !== 'input') return found.kind;
  if (writer === undefined) return 'no_writer';
  const gateway = writer((record) => recordUsage((fn) => withSystem(pool, fn), record));
  const result = await summarisePlaceQna(
    gateway,
    { placeName: found.input.placeName, messages: found.input.messages },
    { tripId: job.trip_id },
  );
  if (!result.ok) return 'rejected';
  const source = found.input.messages.find((m) => m.id === result.snippet.sourceMessageId);
  await withSystem(pool, (tx) =>
    tx.query(
      `INSERT INTO place_qna_summaries (trip_id, poi_id, text, source_message_id, source_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (trip_id, poi_id) DO UPDATE
         SET text = EXCLUDED.text, source_message_id = EXCLUDED.source_message_id,
             source_at = EXCLUDED.source_at`,
      [job.trip_id, job.poi_id, result.snippet.text, result.snippet.sourceMessageId, source?.at],
    ),
  );
  return 'stored';
}

export function placeQnaJob(writer?: PlaceQnaWriter): JobDefinition<PlaceQnaJob> {
  return defineJob({
    queue: EXPLORE_QUEUES.placeQna,
    schema: placeQnaJobSchema,
    singletonKey: (data: PlaceQnaJob) => `${data.trip_id}:${data.poi_id}`,
    handler: async (data, ctx) => ({ outcome: await runPlaceQna(ctx.pool, data, writer) }),
  });
}
