/**
 * `ai.replan` (a material rain change on an outdoor item: `forecast.changed`): the planner's solver
 * looks for a dry slot the same day (weather-replan) and, when it finds one, the guide proposes the
 * move as a ChangeSet with `trigger = weather` (free), reviewed on 3e-3 and accepted with
 * `apply_changeset`. The guide words the headline and reason (route `replan.weather`, templates on
 * any slip). The suggestion is a `weather` disruption row carrying the rain band for 3e-2 and
 * announced on `trip_plan` as `forecast.band`. One open suggestion per item: a new slot replaces
 * the old; a suggestion the crew dismissed for that item and day is not made again; a plan change
 * withdraws a suggestion whose base version is gone (./react.ts).
 */
import { appendDomainEvent, outbox, withSystem } from '@cp/db';
import {
  channelName,
  DISRUPTION_QUEUES,
  replanJobSchema,
  toLocalWallTime,
  type ReplanJob,
} from '@cp/domain';
import { suggestWeatherMove } from '@cp/planner';
import type { CopyResult } from '@cp/ai';
import type pg from 'pg';

import { defineJob, type JobDefinition } from '../../boss';
import { enqueueGuideTextTranslation } from '../i18n/enqueue';
import { readPointForecast } from '../../travel-data/forecast-watch';

export type ReplanWriter = (
  guide: string | null,
  facts: Readonly<Record<string, string | number>>,
  tripId: string,
) => Promise<CopyResult>;

export type ReplanOutcome = 'suggested' | 'unchanged' | 'no_slot' | 'dismissed' | 'gone';

interface ItemRow {
  id: string;
  stable_id: string;
  title: string;
  starts_at: Date;
  ends_at: Date | null;
  locked: boolean;
  attendees: string[];
  trip_id: string;
  crew_id: string;
  version: string;
  guide_id: string | null;
  guide: string | null;
  tz: string;
  destination_id: string | null;
}

async function loadItem(tx: pg.PoolClient, job: ReplanJob): Promise<ItemRow | undefined> {
  const { rows } = await tx.query<ItemRow>(
    `SELECT pi.id, pi.stable_id, left(coalesce(p.name, pi.notes, initcap(pi.category), 'Plan'), 60) AS title,
            pi.starts_at, pi.ends_at,
            (pi.booking_id IS NOT NULL OR pi.must_do_id IS NOT NULL OR pi.locked_reason IS NOT NULL) AS locked,
            coalesce(nullif(pi.attendee_ids, '{}'), ARRAY(SELECT user_id FROM trip_participants tp
              WHERE tp.trip_id = t.id AND tp.rsvp NOT IN ('out', 'waitlisted'))) AS attendees,
            t.id AS trip_id, t.crew_id, t.current_version_id AS version, t.guide_id, g.slug AS guide,
            coalesce(pi.tz, t.tz, d.tz, 'Etc/UTC') AS tz, t.destination_id
       FROM plan_items pi
       JOIN trips t ON t.id = pi.trip_id AND t.current_version_id = pi.version_id
       LEFT JOIN destinations d ON d.id = t.destination_id
       LEFT JOIN pois p ON p.id = pi.poi_id
       LEFT JOIN guides g ON g.id = t.guide_id
      WHERE t.id = $1 AND pi.stable_id = $2 AND pi.is_outdoor AND pi.starts_at > now()`,
    [job.trip_id, job.item_stable_id],
  );
  return rows[0];
}

export async function runReplan(
  pool: pg.Pool,
  job: ReplanJob,
  writer: ReplanWriter,
): Promise<ReplanOutcome> {
  const read = await withSystem(pool, async (tx) => {
    const item = await loadItem(tx, job);
    if (item?.destination_id == null || item.guide_id === null) return null;
    const day = toLocalWallTime(item.starts_at, item.tz).date;
    const dismissed = await tx.query(
      `SELECT 1 FROM disruptions WHERE trip_id = $1 AND dedupe_key = $2 AND status = 'withdrawn'
          AND facts ->> 'dismissed' = 'yes'`,
      [item.trip_id, `weather:${item.stable_id}:${day}`],
    );
    if ((dismissed.rowCount ?? 0) > 0) return 'dismissed' as const;
    const others = await tx.query<{ starts_at: Date; ends_at: Date | null }>(
      `SELECT starts_at, ends_at FROM plan_items
        WHERE version_id = $1 AND stable_id <> $2 AND starts_at IS NOT NULL
          AND starts_at BETWEEN $3::timestamptz - interval '18 hours' AND $3::timestamptz + interval '18 hours'`,
      [item.version, item.stable_id, item.starts_at],
    );
    const forecast = await readPointForecast(tx, item.destination_id, 'centroid');
    const suggestion = suggestWeatherMove({
      item: {
        stableId: item.stable_id,
        title: item.title,
        startsAt: item.starts_at,
        endsAt: item.ends_at,
        locked: item.locked,
      },
      others: others.rows.map((row) => ({ startsAt: row.starts_at, endsAt: row.ends_at })),
      weather: forecast.weather,
      tz: item.tz,
    });
    return { item, day, suggestion };
  });
  if (read === null) return 'gone';
  if (read === 'dismissed') return 'dismissed';
  const { item, day, suggestion } = read;
  if (suggestion === null) return 'no_slot';
  const copy = await writer(item.guide, suggestion.facts, item.trip_id);
  const reason = copy.lines['move'] ?? copy.detail;
  return withSystem(pool, async (tx) => {
    const key = `weather:${item.stable_id}:${day}`;
    const open = await tx.query<{ id: string; change_set_id: string | null; to: string | null }>(
      `SELECT id, change_set_id, facts ->> 'to' AS to FROM disruptions
        WHERE trip_id = $1 AND dedupe_key = $2 AND status = 'open' FOR UPDATE`,
      [item.trip_id, key],
    );
    const previous = open.rows[0];
    if (previous?.to === suggestion.facts['to']) return 'unchanged';
    if (previous !== undefined) {
      await tx.query(
        `UPDATE disruptions SET status = 'withdrawn', resolved_at = now(), version = version + 1
          WHERE id = $1`,
        [previous.id],
      );
      await tx.query(
        "UPDATE change_sets SET status = 'rejected' WHERE id = $1 AND status = 'proposed'",
        [previous.change_set_id],
      );
    }
    const ops = [
      {
        op: 'retime',
        target: item.stable_id,
        before: {
          starts_at: item.starts_at.toISOString(),
          ...(item.ends_at === null ? {} : { ends_at: item.ends_at.toISOString() }),
        },
        after: {
          starts_at: suggestion.startsAt.toISOString(),
          ends_at: suggestion.endsAt.toISOString(),
        },
        reason: reason.slice(0, 200),
        affected_user_ids: item.attendees,
        booking_impact: false,
      },
    ];
    const set = await tx.query<{ id: string }>(
      `INSERT INTO change_sets (trip_id, base_version_id, trigger, scope, author_kind, author_id, status, ops, cost_delta_minor)
       VALUES ($1, $2, 'weather', 'group', 'guide', $3, 'draft', $4, 0) RETURNING id`,
      [item.trip_id, item.version, item.guide_id, JSON.stringify(ops)],
    );
    const changeSetId = set.rows[0]?.id as string;
    await tx.query("UPDATE change_sets SET status = 'proposed' WHERE id = $1", [changeSetId]);
    const disruption = await tx.query<{ id: string }>(
      `INSERT INTO disruptions (trip_id, kind, cause, dedupe_key, ref_kind, ref_id, title, summary,
         affected, facts, change_set_id)
       VALUES ($1, 'weather', 'rain', $2, 'plan_item', $3, $4, $5, $6, $7, $8) RETURNING id`,
      [
        item.trip_id,
        key,
        item.id,
        copy.headline.slice(0, 120),
        copy.detail.slice(0, 280),
        JSON.stringify({
          traveller_ids: item.attendees,
          item_stable_ids: [item.stable_id],
          unaffected_ids: [],
        }),
        JSON.stringify(suggestion.facts),
        changeSetId,
      ],
    );
    const scope = { crewId: item.crew_id, tripId: item.trip_id };
    await appendDomainEvent(tx, {
      type: 'weather.suggested',
      aggregateKind: 'change_set',
      aggregateId: changeSetId,
      actorKind: 'guide',
      actorId: null,
      payload: { trip_id: item.trip_id, change_set_id: changeSetId, plan_item_id: item.id },
      ...scope,
    });
    await outbox(tx, channelName('trip_plan', item.trip_id), 'forecast.band', {
      disruption_id: disruption.rows[0]?.id,
      change_set_id: changeSetId,
      item_stable_id: item.stable_id,
      date: day,
      rain_from: suggestion.rainFrom,
      rain_to: suggestion.rainTo,
    });
    // The suggestion's line in each reader's language.
    await enqueueGuideTextTranslation(tx, { tripId: item.trip_id });
    return 'suggested';
  });
}

export function replanJob(writer: ReplanWriter): JobDefinition<ReplanJob> {
  return defineJob({
    queue: DISRUPTION_QUEUES.replan,
    schema: replanJobSchema,
    singletonKey: (data: ReplanJob) => `${data.trip_id}:${data.item_stable_id}`,
    handler: async (data, ctx) => ({ outcome: await runReplan(ctx.pool, data, writer) }),
  });
}

/**
 * After any applied plan change: the suggestion whose own change set was applied is resolved
 * (accepted), and open suggestions built on a plan version that is no longer current are
 * withdrawn (their times no longer hold).
 */
export async function settleSuggestions(
  tx: pg.PoolClient,
  tripId: string,
  appliedChangeSetId: string | null,
): Promise<number> {
  const { rows } = await tx.query<{ id: string; change_set_id: string; accepted: boolean }>(
    `UPDATE disruptions d
        SET status = CASE WHEN d.change_set_id = $2 THEN 'resolved' ELSE 'withdrawn' END,
            resolved_at = now(), version = d.version + 1
       FROM change_sets c, trips t
      WHERE d.trip_id = $1 AND d.kind = 'weather' AND d.status = 'open'
        AND c.id = d.change_set_id AND t.id = d.trip_id
        AND (d.change_set_id = $2 OR c.base_version_id IS DISTINCT FROM t.current_version_id)
      RETURNING d.id, d.change_set_id, d.change_set_id = $2 AS accepted`,
    [tripId, appliedChangeSetId],
  );
  for (const row of rows) {
    if (row.accepted) continue;
    await tx.query(
      "UPDATE change_sets SET status = 'stale' WHERE id = $1 AND status IN ('proposed', 'voting')",
      [row.change_set_id],
    );
    await outbox(tx, channelName('trip_plan', tripId), 'forecast.band', {
      disruption_id: row.id,
      change_set_id: row.change_set_id,
      withdrawn: true,
    });
  }
  return rows.length;
}
