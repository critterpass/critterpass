/**
 * `recap.build`: a trip's recap from code alone. When the trip ends (and again on late data), the
 * builder loads the trip and everyone who was IN at any point, runs every registered contributor
 * over one draft (plan, rides, ledger, critters, visits), deals the awards and picks the best day,
 * validates the result against the `@cp/domain` recap schemas and writes it as a new version, but
 * only when something changed: a re-run over the same data bumps nothing. The first build also
 * stamps every traveller's passport with the trip. Then the guide words the new version (./copy.ts),
 * which turns the recap `ready`.
 *
 * The recap row shows progress (`queued` → `building` → `ready`), an `agent_jobs(kind=recap)` row
 * records the run, and a build whose last attempt fails leaves the recap `failed` (a re-run that
 * fails keeps the version already shown).
 */
import { withSystem } from '@cp/db';
import {
  assignAwards,
  recapBestDay,
  recapBuildJobSchema,
  recapGotAwaySchema,
  recapReceiptSchema,
  recapRouteSchema,
  RECAP_QUEUES,
  recapStatsSchema,
  type RecapBuildJob,
  type RecapContent,
  type RecapReceipt,
} from '@cp/domain';
import type pg from 'pg';

import { defineJob, type AnyJobDefinition } from '../../boss/define-job';
import { recapContributors, type RecapDeps, type RecapDraft, type RecapTrip } from './contributors';
import { writeCopyForRecap, type RecapCopyOutcome, type RecapCopyWriter } from './copy';
import {
  changedSections,
  contentHash,
  addViewers,
  loadTravellers,
  loadTripRow,
  lockRecap,
  writeVersion,
  type TripRow,
} from './store';

export type RecapBuildOutcome =
  | { readonly outcome: 'skipped'; readonly reason: 'no_trip' | 'not_ended' | 'no_travellers' }
  | {
      readonly outcome: 'built';
      readonly recap_id: string;
      readonly version: number;
      readonly bumped: boolean;
      readonly copy: RecapCopyOutcome;
    };

export interface RecapBuildDeps extends RecapDeps {
  /** The guide's words; without it the template copy stands in. */
  readonly writer?: RecapCopyWriter | undefined;
}

const ENDED_STATUSES = new Set(['post_trip', 'archived']);

function emptyDraft(): RecapDraft {
  return {
    route: {
      stops: [],
      legs: [],
      total_m: 0,
      estimated: false,
      longest_leg: null,
      ridden_m: 0,
      rides: 0,
      top_driver: null,
    },
    receipt: null,
    critters: { forms_found: 0, new_critters: 0, form_ids: [] },
    gotAway: null,
    superlatives: [],
    photos: null,
    metrics: new Map(),
    details: new Map(),
    dayScores: new Map(),
  };
}

function emptyReceipt(trip: RecapTrip, travellers: number): RecapReceipt {
  return {
    currency: trip.currency,
    lines: [],
    total_minor: 0,
    expenses: 0,
    meals: 0,
    travellers,
    each_minor: 0,
    planned_each_minor: null,
    planned_total_minor: null,
    under_minor: null,
    priciest: null,
    cheapest_day: null,
    outstanding_minor: 0,
    settled: true,
    settled_on: null,
    settled_days_after_end: null,
  };
}

function daysInclusive(start: string, end: string): number {
  return Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1;
}

/** The deterministic aggregates for one trip and its travellers, validated. */
export async function aggregateRecap(
  tx: pg.PoolClient,
  trip: RecapTrip,
  members: readonly string[],
  deps: RecapDeps,
): Promise<RecapContent> {
  const draft = emptyDraft();
  const scope = { trip, members };
  for (const contributor of recapContributors()) {
    await contributor.contribute(tx, scope, draft, deps);
  }
  const legs = draft.route.legs;
  let longest: number | null = null;
  for (const [index, leg] of legs.entries()) {
    if (longest === null || leg.distance_m > (legs[longest]?.distance_m ?? 0)) longest = index;
  }
  const route = recapRouteSchema.parse({
    ...draft.route,
    total_m: legs.reduce((sum, leg) => sum + leg.distance_m, 0),
    estimated: legs.some((leg) => leg.estimate),
    longest_leg: longest,
  });
  const stats = recapStatsSchema.parse({
    start_date: trip.startDate,
    end_date: trip.endedOn,
    days: daysInclusive(trip.startDate, trip.endedOn),
    travellers: members.length,
    distance_m: route.total_m,
    distance_estimated: route.estimated,
    superlatives: draft.superlatives,
    photos: draft.photos,
    critters: draft.critters,
    best_day: recapBestDay(draft.dayScores, trip.startDate, trip.endedOn),
  });
  return {
    stats,
    route,
    receipt: recapReceiptSchema.parse(draft.receipt ?? emptyReceipt(trip, members.length)),
    got_away: draft.gotAway === null ? null : recapGotAwaySchema.parse(draft.gotAway),
    awards: assignAwards(members, draft.metrics, draft.details),
  };
}

function recapTrip(tripId: string, row: TripRow, endedOn: string): RecapTrip {
  return {
    id: tripId,
    crewId: row.crew_id,
    destinationId: row.destination_id,
    tz: row.tz,
    startDate: row.start_date ?? endedOn,
    endedOn,
    currentVersionId: row.current_version_id,
    currency: row.currency,
  };
}

/** The last covered day: the recap's, else the job's, else the earlier of end date and today. */
function endedOnFor(row: TripRow, recapEndedOn: string | null, job: RecapBuildJob): string {
  const ended =
    recapEndedOn ??
    job.ended_on ??
    (row.end_date !== null && row.end_date < row.today ? row.end_date : row.today);
  return row.start_date !== null && ended < row.start_date ? row.start_date : ended;
}

const stepJson = (status: 'running' | 'done' | 'failed', error: string | null = null) =>
  JSON.stringify([
    {
      step: 'aggregate',
      status,
      attempts: 1,
      started_at: null,
      finished_at: status === 'running' ? null : new Date().toISOString(),
      error,
    },
  ]);

/** Builds (or re-runs) the recap of `job.trip_id`; see the module comment. */
export async function buildRecap(
  pool: pg.Pool,
  job: RecapBuildJob,
  deps: RecapBuildDeps,
  now: Date = new Date(),
): Promise<RecapBuildOutcome> {
  const start = await withSystem(pool, async (tx) => {
    const row = await loadTripRow(tx, job.trip_id);
    if (row === null) return { skip: 'no_trip' as const };
    if (!ENDED_STATUSES.has(row.status)) return { skip: 'not_ended' as const };
    const members = await loadTravellers(tx, job.trip_id);
    if (members.length === 0) return { skip: 'no_travellers' as const };
    const { rows: agent } = await tx.query<{ id: string }>(
      `INSERT INTO agent_jobs (trip_id, kind, status, steps) VALUES ($1, 'recap', 'running', $2)
       RETURNING id`,
      [job.trip_id, stepJson('running')],
    );
    const agentJobId = agent[0]?.id ?? null;
    await tx.query(
      `INSERT INTO recaps (trip_id, crew_id, status, agent_job_id) VALUES ($1, $2, 'building', $3)
       ON CONFLICT (trip_id) DO UPDATE
          SET status = CASE WHEN recaps.status = 'ready' THEN 'ready' ELSE 'building' END,
              agent_job_id = EXCLUDED.agent_job_id`,
      [job.trip_id, row.crew_id, agentJobId],
    );
    return { row, agentJobId };
  });
  if ('skip' in start) return { outcome: 'skipped', reason: start.skip };

  try {
    const outcome = await withSystem(pool, async (tx) => {
      const recap = await lockRecap(tx, job.trip_id);
      const trip = recapTrip(job.trip_id, start.row, endedOnFor(start.row, recap.ended_on, job));
      const members = await loadTravellers(tx, job.trip_id);
      const content = await aggregateRecap(tx, trip, members, deps);
      const hash = contentHash(content);
      if (recap.version > 0 && recap.content_hash === hash) {
        await addViewers(tx, recap.id, trip.id, members);
        return { recapId: recap.id, version: recap.version, bumped: false };
      }
      const changed = recap.version === 0 ? [] : await changedSections(tx, recap, content);
      const version = recap.version + 1;
      await writeVersion(tx, { recap, trip, content, hash, version, changed, now });
      return { recapId: recap.id, version, bumped: true };
    });
    await withSystem(pool, (tx) =>
      tx.query(`UPDATE agent_jobs SET status = 'succeeded', steps = $2 WHERE id = $1`, [
        start.agentJobId,
        stepJson('done'),
      ]),
    );
    const copy = await writeCopyForRecap(pool, job.trip_id, deps.writer, now);
    return {
      outcome: 'built',
      recap_id: outcome.recapId,
      version: outcome.version,
      bumped: outcome.bumped,
      copy,
    };
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 200);
    await withSystem(pool, (tx) =>
      tx.query(`UPDATE agent_jobs SET status = 'failed', steps = $2 WHERE id = $1`, [
        start.agentJobId,
        stepJson('failed', message),
      ]),
    );
    throw error;
  }
}

/** Marks a recap that never got ready `failed`, so the app can offer a retry. */
export async function failRecap(pool: pg.Pool, tripId: string, reason: string): Promise<void> {
  await withSystem(pool, (tx) =>
    tx.query(
      `UPDATE recaps SET status = 'failed', failure_reason = $2
        WHERE trip_id = $1 AND status <> 'ready'`,
      [tripId, reason.slice(0, 200)],
    ),
  );
}

export function recapBuildJob(deps: RecapBuildDeps): AnyJobDefinition {
  return defineJob({
    queue: RECAP_QUEUES.build,
    schema: recapBuildJobSchema,
    async handler(data, ctx) {
      try {
        return { ...(await buildRecap(ctx.pool, data, deps)) };
      } catch (error) {
        if (ctx.job.isFinalAttempt) {
          await failRecap(ctx.pool, data.trip_id, error instanceof Error ? error.message : 'error');
        }
        throw error;
      }
    },
  });
}
