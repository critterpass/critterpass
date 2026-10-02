/**
 * `weather.watch` (cron, every 15 minutes): each confirmed, pre-trip or in-trip trip up to 16 days
 * out is re-scored when due (every 3 h; hourly within 48 h of the start and during the trip; every
 * 15 min while a sea or volcano row is WATCHING or PLAN B). The rules score (watch-rules); only rows
 * whose status or numbers changed are re-worded (route `watch.copy`, templates otherwise). A status
 * that rises appends `watch.escalated`: into PLAN B it pings the crew (N-26, plan-changing), any
 * other rise waits for the evening roundup. The same forecast twice changes and sends nothing.
 */
import { appendDomainEvent, outbox, withSystem } from '@cp/db';
import {
  channelName,
  DISRUPTION_QUEUES,
  isPlanChangingEscalation,
  watchRank,
  type WatchStatus,
} from '@cp/domain';
import { scoreWatch, type WatchVerdict } from '@cp/planner';
import type pg from 'pg';
import { z } from 'zod';

import { defineJob, type JobDefinition } from '../../boss';
import { translateDisruptionWords } from './guide-words';
import { withdrawStorm } from './storm-decision';
import { loadWatchInputs, type WatchedTrip } from './watch-score';

export type WatchWriter = (
  trip: WatchedTrip,
  rows: readonly { id: string; status: string; verdict: WatchVerdict }[],
) => Promise<Readonly<Record<string, { title: string; detail: string }>>>;

/** Called once per row newly on PLAN B (the storm decision hooks in here). */
export type PlanBHandoff = (
  tx: pg.PoolClient,
  trip: WatchedTrip,
  watchItemId: string,
  now: Date,
) => Promise<void>;

export interface WatchOutcome {
  readonly trips: number;
  readonly changed: number;
  readonly escalated: number;
}

async function dueTrips(tx: pg.PoolClient, now: Date): Promise<WatchedTrip[]> {
  const { rows } = await tx.query<WatchedTrip>(
    `SELECT t.id, t.crew_id AS "crewId", t.destination_id AS "destinationId",
            coalesce(t.tz, d.tz, 'Etc/UTC') AS tz, g.slug AS guide
       FROM trips t
       JOIN destinations d ON d.id = t.destination_id
       LEFT JOIN guides g ON g.id = t.guide_id
       LEFT JOIN LATERAL (
         SELECT max(w.checked_at) AS checked,
                bool_or(w.kind IN ('marine', 'volcano') AND w.status IN ('watching', 'plan_b')) AS hot
           FROM watch_items w WHERE w.trip_id = t.id
       ) last ON true
      WHERE t.status IN ('confirmed', 'pre_trip', 'in_trip')
        AND (t.start_date IS NULL OR t.start_date <= ($1::timestamptz + interval '16 days')::date)
        AND (t.end_date IS NULL OR t.end_date >= $1::date)
        AND (last.checked IS NULL
             OR last.checked <= $1::timestamptz - CASE
                  WHEN last.hot THEN interval '15 minutes'
                  WHEN t.status = 'in_trip'
                    OR t.start_date <= ($1::timestamptz + interval '48 hours')::date
                    THEN interval '1 hour'
                  ELSE interval '3 hours' END + interval '1 minute')
      ORDER BY t.id`,
    [now],
  );
  return rows;
}

/** Facts as a stable string (jsonb does not keep key order). */
const canonical = (facts: unknown): string =>
  JSON.stringify(Object.entries((facts ?? {}) as Record<string, unknown>).sort());

const sameVerdict = (row: { status: string; score: number; impact: unknown }, v: WatchVerdict) =>
  row.status === v.status &&
  row.score === v.score &&
  canonical((row.impact as { facts?: unknown } | null)?.facts) === canonical(v.facts);

export async function watchTrip(
  tx: pg.PoolClient,
  trip: WatchedTrip,
  now: Date,
  writer: WatchWriter,
  onPlanB?: PlanBHandoff,
): Promise<{ changed: number; escalated: number }> {
  const inputs = await loadWatchInputs(tx, trip, now);
  const { rows: stored } = await tx.query<{
    id: string;
    target_ref: string;
    status: WatchStatus;
    score: number;
    impact: unknown;
  }>(
    'SELECT id, target_ref, status, score, impact FROM watch_items WHERE trip_id = $1 FOR UPDATE',
    [trip.id],
  );
  const byRef = new Map(stored.map((row) => [row.target_ref, row]));
  const changes: { id: string; status: string; verdict: WatchVerdict; from: WatchStatus | null }[] =
    [];
  const seen = new Set<string>();
  for (const input of inputs) {
    const old = byRef.get(input.subject.stableId);
    const verdict = scoreWatch(input.subject, input.signals, now, old?.status ?? null);
    if (verdict === null || (old === undefined && verdict.status === 'go')) continue;
    seen.add(input.subject.stableId);
    if (old !== undefined && sameVerdict(old, verdict)) continue;
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO watch_items (trip_id, kind, target_ref, plan_item_stable_id, day, status, score,
         impact, title, detail, checked_at)
       VALUES ($1, $2, $3, $11, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (trip_id, target_ref) DO UPDATE
         SET kind = EXCLUDED.kind, status = EXCLUDED.status, score = EXCLUDED.score, impact = EXCLUDED.impact,
             day = EXCLUDED.day, checked_at = EXCLUDED.checked_at, resolved_at = NULL
       RETURNING id`,
      [
        trip.id,
        verdict.kind,
        input.subject.stableId,
        input.subject.day,
        verdict.status,
        verdict.score,
        JSON.stringify({ reasons: verdict.reasons, facts: verdict.facts }),
        verdict.titleTemplate.slice(0, 120),
        verdict.detailTemplate.slice(0, 280),
        now,
        input.subject.stableId,
      ],
    );
    changes.push({
      id: rows[0]?.id ?? '',
      status: verdict.status,
      verdict,
      from: old?.status ?? null,
    });
  }
  // Items gone from the plan or out of danger: back to GO, kept as history.
  await tx.query(
    `UPDATE watch_items SET status = 'go', resolved_at = $3, checked_at = $3
      WHERE trip_id = $1 AND status <> 'go' AND NOT (target_ref = ANY($2::text[]))`,
    [trip.id, [...seen], now],
  );
  await tx.query('UPDATE watch_items SET checked_at = $2 WHERE trip_id = $1', [trip.id, now]);
  if (changes.length === 0) return { changed: 0, escalated: 0 };
  const words = await writer(trip, changes);
  let escalated = 0;
  for (const change of changes) {
    const copy = words[change.id];
    if (copy !== undefined) {
      await tx.query('UPDATE watch_items SET title = $2, detail = $3 WHERE id = $1', [
        change.id,
        copy.title.slice(0, 120),
        copy.detail.slice(0, 280),
      ]);
    }
    await outbox(tx, channelName('trip_watch', trip.id), 'watch.changed', {
      watch_item_id: change.id,
      status: change.status,
    });
    if (change.from === 'plan_b' && change.verdict.status !== 'plan_b') {
      await withdrawStorm(tx, change.id);
    }
    const rising =
      change.from === null || watchRank(change.verdict.status) > watchRank(change.from);
    if (!rising || change.verdict.status === 'go') continue;
    const planChanging = isPlanChangingEscalation(change.from, change.verdict.status);
    await tx.query('UPDATE watch_items SET escalated_at = $2 WHERE id = $1', [change.id, now]);
    await appendDomainEvent(tx, {
      type: 'watch.escalated',
      aggregateKind: 'trip',
      aggregateId: trip.id,
      actorKind: 'system',
      actorId: null,
      crewId: trip.crewId,
      tripId: trip.id,
      payload: {
        trip_id: trip.id,
        watch_item_id: change.id,
        status: change.verdict.status,
        plan_changing: planChanging,
      },
    });
    escalated += 1;
    if (planChanging && onPlanB !== undefined) await onPlanB(tx, trip, change.id, now);
  }
  // Changed rows have new words: each reader gets them in their language.
  if (changes.length > 0) await translateDisruptionWords(tx, trip.id);
  return { changed: changes.length, escalated };
}

export async function runWeatherWatch(
  pool: pg.Pool,
  writer: WatchWriter,
  onPlanB?: PlanBHandoff,
  now: Date = new Date(),
): Promise<WatchOutcome> {
  const trips = await withSystem(pool, (tx) => dueTrips(tx, now));
  let changed = 0;
  let escalated = 0;
  for (const trip of trips) {
    const result = await withSystem(pool, (tx) => watchTrip(tx, trip, now, writer, onPlanB));
    changed += result.changed;
    escalated += result.escalated;
  }
  return { trips: trips.length, changed, escalated };
}

export function weatherWatchJob(
  writer: WatchWriter,
  onPlanB?: PlanBHandoff,
): JobDefinition<Record<string, never> | null | undefined> {
  return defineJob({
    queue: DISRUPTION_QUEUES.weatherWatch,
    schema: z.object({}).nullish(),
    handler: async (_data, ctx) => ({ ...(await runWeatherWatch(ctx.pool, writer, onPlanB)) }),
  });
}
