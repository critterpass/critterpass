/**
 * One plan check run, in one transaction: read the plan once (the crew's, or the organiser's
 * private draft before the crew has one), run the rules, keep issues
 * that still hold under their own ids (matched by fingerprint), work out every idea's fit against
 * the same context, record the run against the trip's daily cap, and hint open screens. An issue
 * the organiser chose to keep as it is stays out of the list and the counts while the stops around
 * it are the same. A version whose legs are not stored yet is not checked: the run waits for them
 * (`legs-ready.ts`). No model is called, and nothing is metered: this is deterministic system work.
 */
import { outbox, withSystem } from '@cp/db';
import {
  channelName,
  knownHours,
  planCheckQuietSchema,
  PLANNING_RT,
  toLocalWallTime,
  type PlanCheckJob,
  type StoredFit,
} from '@cp/domain';
import {
  checkPlan,
  crowdWeeks,
  fitPlace,
  isOutdoorCategory,
  splitQuiet,
  type CrowdCurveRow,
  type RankedIssue,
} from '@cp/planner';
import type pg from 'pg';

import { loadCheck, readCheckTrip, type LoadedCheck } from './context';
import { legsPending } from './legs-ready';

export type PlanCheckOutcome =
  | {
      readonly outcome: 'checked';
      readonly fix: number;
      readonly know: number;
      readonly ideas: number;
    }
  | { readonly outcome: 'skipped'; readonly reason: 'inactive' | 'daily_cap' | 'legs_pending' };

async function writeIssues(
  tx: pg.PoolClient,
  tripId: string,
  versionId: string,
  issues: readonly RankedIssue[],
): Promise<void> {
  const { rows } = await tx.query<{ id: string; fingerprint: string }>(
    'SELECT id, fingerprint FROM plan_check_issues WHERE trip_id = $1 AND version_id = $2',
    [tripId, versionId],
  );
  const kept = new Map(rows.map((row) => [row.fingerprint, row.id]));
  await tx.query(
    `DELETE FROM plan_check_issues
      WHERE trip_id = $1 AND (version_id <> $2 OR NOT (fingerprint = ANY($3::text[])))`,
    [tripId, versionId, issues.map((issue) => issue.fingerprint)],
  );
  for (const issue of issues) {
    const values = [
      issue.kind,
      issue.severity,
      issue.dayId,
      issue.stableIds,
      JSON.stringify(issue.params),
      issue.fix === null ? null : JSON.stringify(issue.fix),
      issue.rank,
    ];
    const id = kept.get(issue.fingerprint);
    if (id === undefined) {
      await tx.query(
        `INSERT INTO plan_check_issues
           (trip_id, version_id, kind, severity, day_id, stable_ids, params, fix, rank, fingerprint)
         VALUES ($8, $9, $1, $2, $3, $4::uuid[], $5, $6, $7, $10)`,
        [...values, tripId, versionId, issue.fingerprint],
      );
    } else {
      await tx.query(
        `UPDATE plan_check_issues SET kind = $1, severity = $2, day_id = $3, stable_ids = $4::uuid[],
                params = $5, fix = $6, rank = $7, updated_at = now() WHERE id = $8`,
        [...values, id],
      );
    }
  }
}

/** The issues still to show, and the quiet marks that still hold on the plan as it is. */
function withoutQuiet(issues: readonly RankedIssue[], stored: unknown, loaded: LoadedCheck) {
  const marks = planCheckQuietSchema.array().safeParse(stored);
  return splitQuiet(
    issues,
    (issue) => ({
      kind: issue.kind,
      stableIds: issue.stableIds,
      dayNo: issue.stableIds.length > 0 ? null : issue.dayNo,
      bookingId: issue.kind === 'booking_note' ? String(issue.params['booking_id']) : null,
    }),
    (marks.success ? marks.data : []).map((mark) => ({
      ...mark,
      stableIds: mark.stable_ids,
      dayNo: mark.day_no,
      bookingId: mark.booking_id,
    })),
    loaded.context.days,
  );
}

/** Every live idea's fit, against the same context the rules read. */
async function writeIdeaFits(tx: pg.PoolClient, loaded: LoadedCheck, now: Date): Promise<number> {
  const versionId = loaded.trip.versionId;
  // Ideas sync to the whole crew: a fit worked out on the organiser's private draft would tell a
  // member the draft exists and where its free time is. Her screens ask for fits on her draft
  // when they open (the fit route reads the plan the caller sees).
  if (versionId === null || loaded.trip.privateDraft) return 0;
  const { rows } = await tx.query<{
    id: string;
    poi_id: string;
    category: string;
    lat: number;
    lng: number;
    hours: unknown;
    time_needed_min: number | null;
    best_time: boolean;
    best_time_text: string | null;
    name: string;
    tags: string[];
    want: number;
    rather_not: number;
  }>(
    `SELECT i.id, i.poi_id, p.category, p.lat, p.lng, p.hours,
            (p.editorial->>'time_needed_min')::int AS time_needed_min, (p.editorial ? 'best_time') AS best_time,
            p.editorial->>'best_time' AS best_time_text, p.name, p.tags,
            (SELECT count(*) FROM place_stances s WHERE s.trip_id = i.trip_id AND s.poi_id = i.poi_id AND s.stance = 'want')::int AS want,
            (SELECT count(*) FROM place_stances s WHERE s.trip_id = i.trip_id AND s.poi_id = i.poi_id AND s.stance = 'rather_not')::int AS rather_not
       FROM trip_ideas i JOIN pois p ON p.id = i.poi_id
      WHERE i.trip_id = $1 AND i.deleted_at IS NULL`,
    [loaded.trip.id],
  );
  const curves = await tx.query<CrowdCurveRow>(
    `SELECT poi_id, dow, hourly, source, approved_at FROM crowd_forecasts
      WHERE poi_id = ANY($1::uuid[]) AND source IN ('visits', 'editorial')`,
    [rows.map((row) => row.poi_id)],
  );
  const weeks = crowdWeeks(curves.rows);
  const inPlan = new Map(
    loaded.context.days.flatMap((day) =>
      day.items.flatMap((item) =>
        item.poiId === null ? [] : [[item.poiId, item.stableId] as const],
      ),
    ),
  );
  for (const row of rows) {
    const fit = fitPlace(loaded.context, {
      poiId: row.poi_id,
      point: { lat: row.lat, lng: row.lng },
      category: row.category,
      hours: knownHours(row.hours),
      timeNeededMin: row.time_needed_min,
      outdoor: isOutdoorCategory(row.category),
      crowds: weeks.get(row.poi_id) ?? null,
      stances: { want: row.want, ratherNot: row.rather_not },
      bestTime: row.best_time,
      name: row.name,
      tags: row.tags,
      bestTimeText: row.best_time_text,
      stableId: inPlan.get(row.poi_id) ?? null,
    });
    const stored: StoredFit = { ...fit, version_id: versionId, computed_at: now.toISOString() };
    await tx.query(
      'UPDATE trip_ideas SET fit = $2, fit_version_id = $3, updated_at = now() WHERE id = $1',
      [row.id, JSON.stringify(stored), versionId],
    );
  }
  return rows.length;
}

export async function runPlanCheck(
  pool: pg.Pool,
  job: PlanCheckJob,
  now: Date = new Date(),
): Promise<PlanCheckOutcome> {
  return withSystem(pool, async (tx) => {
    const trip = await readCheckTrip(tx, job.trip_id);
    if (trip === null) return { outcome: 'skipped', reason: 'inactive' };
    if (trip.versionId !== null && (await legsPending(tx, trip.id, trip.versionId, now))) {
      return { outcome: 'skipped', reason: 'legs_pending' };
    }
    const today = toLocalWallTime(now, trip.tz).date;
    const previous = (
      await tx.query<{ runs_on: string | null; runs_today: number; quiet: unknown }>(
        `SELECT to_char(runs_on, 'YYYY-MM-DD') AS runs_on, runs_today, quiet FROM plan_checks
          WHERE trip_id = $1 FOR UPDATE`,
        [trip.id],
      )
    ).rows[0];
    const runsToday = previous?.runs_on === today ? previous.runs_today : 0;
    const loaded = await loadCheck(tx, trip, now);
    if (job.trigger !== 'daily' && runsToday >= loaded.maxRunsPerDay) {
      // No run is coming today: the check stops saying it is waiting for one.
      await tx.query(
        "UPDATE plan_checks SET status = 'done' WHERE trip_id = $1 AND status = 'queued'",
        [trip.id],
      );
      return { outcome: 'skipped', reason: 'daily_cap' };
    }
    const found =
      trip.versionId === null
        ? []
        : checkPlan({
            context: loaded.context,
            places: loaded.places,
            bookings: loaded.bookings,
            thresholds: loaded.thresholds,
            now,
          });
    const { live: issues, marks } = withoutQuiet(found, previous?.quiet ?? [], loaded);
    const quiet = marks.map(({ kind, stable_ids, day_no, booking_id, around, by, at }) => ({
      kind,
      stable_ids,
      day_no,
      booking_id,
      around,
      by,
      at,
    }));
    const fix = issues.filter((issue) => issue.severity === 'fix').length;
    const know = issues.length - fix;
    if (trip.versionId !== null) await writeIssues(tx, trip.id, trip.versionId, issues);
    const ideas = await writeIdeaFits(tx, loaded, now);
    // The trip-wide row is the crew's: a private draft's run counts against the day's runs and
    // says nothing else there. Its issues are the draft's own, and the draft carries the stamp.
    const shown = trip.privateDraft
      ? { versionId: null, fix: 0, know: 0, quiet: previous?.quiet ?? [] }
      : { versionId: trip.versionId, fix, know, quiet };
    await tx.query(
      `INSERT INTO plan_checks (trip_id, version_id, status, checked_at, fix_count, know_count, runs_on, runs_today, quiet)
       VALUES ($1, $2, 'done', $3, $4, $5, $6, $7, $8)
       ON CONFLICT (trip_id) DO UPDATE SET version_id = EXCLUDED.version_id, status = 'done',
         checked_at = EXCLUDED.checked_at, fix_count = EXCLUDED.fix_count,
         know_count = EXCLUDED.know_count, runs_on = EXCLUDED.runs_on,
         runs_today = EXCLUDED.runs_today, quiet = EXCLUDED.quiet, updated_at = now()`,
      [
        trip.id,
        shown.versionId,
        now,
        shown.fix,
        shown.know,
        today,
        runsToday + 1,
        JSON.stringify(shown.quiet),
      ],
    );
    if (trip.privateDraft) {
      await tx.query('UPDATE itinerary_versions SET checked_at = $2 WHERE id = $1', [
        trip.versionId,
        now,
      ]);
    } else if (trip.versionId !== null) {
      await outbox(tx, channelName('trip_plan', trip.id), PLANNING_RT.checkUpdated, {
        version: trip.versionId,
        fix_count: fix,
        know_count: know,
      });
    }
    return { outcome: 'checked', fix, know, ideas };
  });
}
