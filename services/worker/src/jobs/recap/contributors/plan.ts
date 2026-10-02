/**
 * The plan contributor: the trail (the current plan's places in order, consecutive items at one
 * place folded into a stop), each leg's distance between stops, the stops that started before
 * sunrise, and per traveller the plan edits they made and the early starts they were up for. The
 * route never reads a location fix: it is the plan's stops, routed by road when a routing engine is
 * configured and estimated in a straight line when not.
 */
import { solarDay, toLocalWallTime, type RecapLeg, type RecapStop } from '@cp/domain';
import type pg from 'pg';

import {
  addDayScore,
  addDetail,
  addMetric,
  dayNoOf,
  type RecapContributor,
  type RecapDeps,
  type RecapDraft,
  type RecapScope,
} from './types';

/** An early start is a leave-by before this local hour. */
const EARLY_START_HOUR = 7;

interface PlanStopRow {
  readonly poi_id: string;
  readonly name: string;
  readonly category: string | null;
  readonly lat: number;
  readonly lng: number;
  readonly starts_at: Date | null;
  readonly local_date: string;
}

async function loadPlanStops(tx: pg.PoolClient, scope: RecapScope): Promise<PlanStopRow[]> {
  const { trip } = scope;
  if (trip.currentVersionId === null) return [];
  const { rows } = await tx.query<PlanStopRow>(
    `SELECT p.id AS poi_id, p.name, p.category, p.lat, p.lng, pi.starts_at,
            coalesce(pd.date, $2::date + (pd.day_no - 1))::text AS local_date
       FROM plan_items pi
       JOIN plan_days pd ON pd.id = pi.day_id
       JOIN pois p ON p.id = pi.poi_id
      WHERE pi.version_id = $1 AND pi.status <> 'voting'
        AND p.lat IS NOT NULL AND p.lng IS NOT NULL
        AND coalesce(pd.date, $2::date + (pd.day_no - 1)) BETWEEN $2::date AND $3::date
      ORDER BY coalesce(pd.date, $2::date + (pd.day_no - 1)), pi.starts_at NULLS LAST, pi.id`,
    [trip.currentVersionId, trip.startDate, trip.endedOn],
  );
  return rows;
}

function hhmm(time: string): string {
  return time.slice(0, 5);
}

interface FoldedStop extends RecapStop {
  readonly lat: number;
  readonly lng: number;
}

function foldStops(scope: RecapScope, rows: readonly PlanStopRow[]): FoldedStop[] {
  const stops: FoldedStop[] = [];
  for (const row of rows) {
    const day = dayNoOf(scope.trip, row.local_date);
    const last = stops.at(-1);
    if (last !== undefined && last.poi_id === row.poi_id) {
      stops[stops.length - 1] = { ...last, day_to: day };
      continue;
    }
    let localTime: string | null = null;
    let beforeSunrise = false;
    if (row.starts_at !== null) {
      localTime = hhmm(toLocalWallTime(row.starts_at, scope.trip.tz).time);
      const { sunrise } = solarDay(row.local_date, row.lat, row.lng);
      beforeSunrise = sunrise !== null && row.starts_at.getTime() < sunrise.getTime();
    }
    stops.push({
      poi_id: row.poi_id,
      name: row.name,
      category: row.category,
      day_from: day,
      day_to: day,
      local_time: localTime,
      before_sunrise: beforeSunrise,
      lat: row.lat,
      lng: row.lng,
    });
  }
  return stops;
}

async function routeLegs(
  stops: readonly FoldedStop[],
  router: RecapDeps['router'],
): Promise<RecapLeg[]> {
  const legs: RecapLeg[] = [];
  for (let index = 1; index < stops.length; index += 1) {
    const from = stops[index - 1] as FoldedStop;
    const to = stops[index] as FoldedStop;
    const [cell] = await router.matrix('auto', [{ lat: from.lat, lng: from.lng }], {
      lat: to.lat,
      lng: to.lng,
    });
    legs.push({
      from: index - 1,
      to: index,
      distance_m: Math.max(0, Math.round(cell?.distanceM ?? 0)),
      minutes: Math.max(0, Math.round(cell?.minutes ?? 0)),
      estimate: cell?.estimate ?? true,
      ride: null,
    });
  }
  return legs;
}

async function addPlanEdits(tx: pg.PoolClient, scope: RecapScope, draft: RecapDraft) {
  const { rows } = await tx.query<{ author_id: string; edits: number }>(
    `SELECT author_id, count(*)::int AS edits FROM change_sets
      WHERE trip_id = $1 AND author_kind = 'user' AND status = 'applied'
        AND author_id = ANY($2::uuid[])
      GROUP BY author_id`,
    [scope.trip.id, scope.members],
  );
  for (const row of rows) addMetric(draft, row.author_id, 'plan_edits', row.edits);
}

async function addEarlyStarts(tx: pg.PoolClient, scope: RecapScope, draft: RecapDraft) {
  const { rows } = await tx.query<{ user_id: string; leave_at: Date; local_date: string }>(
    `SELECT r.user_id, l.leave_at, l.local_date::text AS local_date
       FROM leave_bys l JOIN readiness r ON r.leave_by_id = l.id
      WHERE l.trip_id = $1 AND l.state <> 'cancelled'
        AND r.state IN ('up', 'ready', 'left') AND r.user_id = ANY($2::uuid[])
        AND l.local_date BETWEEN $3::date AND $4::date
      ORDER BY l.leave_at, r.user_id`,
    [scope.trip.id, scope.members, scope.trip.startDate, scope.trip.endedOn],
  );
  const earliest = new Map<string, string>();
  for (const row of rows) {
    const time = hhmm(toLocalWallTime(row.leave_at, scope.trip.tz).time);
    if (Number(time.slice(0, 2)) >= EARLY_START_HOUR) continue;
    addMetric(draft, row.user_id, 'early_starts', 1);
    addDayScore(draft, row.local_date, 1);
    const known = earliest.get(row.user_id);
    if (known === undefined || time < known) earliest.set(row.user_id, time);
  }
  for (const [userId, time] of earliest) addDetail(draft, userId, { earliest_time: time });
}

export const planContributor: RecapContributor = {
  name: 'plan',
  async contribute(tx, scope, draft, deps) {
    const rows = await loadPlanStops(tx, scope);
    const folded = foldStops(scope, rows);
    const legs = await routeLegs(folded, deps.router);
    const stops: RecapStop[] = folded.map(({ lat: _lat, lng: _lng, ...stop }) => stop);
    draft.route = { ...draft.route, stops, legs };
    for (const stop of stops) {
      if (!stop.before_sunrise || stop.local_time === null) continue;
      const localDate = rows.find(
        (row) =>
          row.poi_id === stop.poi_id && dayNoOf(scope.trip, row.local_date) === stop.day_from,
      )?.local_date;
      if (localDate === undefined) continue;
      draft.superlatives.push({
        kind: 'before_sunrise',
        poi_id: stop.poi_id,
        name: stop.name,
        category: stop.category,
        day_no: stop.day_from,
        local_date: localDate,
        local_time: stop.local_time,
        visited_by: 0,
      });
    }
    await addPlanEdits(tx, scope, draft);
    await addEarlyStarts(tx, scope, draft);
  },
};
