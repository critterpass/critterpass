/**
 * The guide's cost and fit tools (docs/api-contracts.md §6). The guide only words these numbers:
 * `cost_quote` prices proposed plan changes for the asking member with `@cp/cost-engine`, and
 * `fit_check` checks a place against the trip's dates, the place's hours and the current plan
 * with `@cp/planner`. Both run as the asking member, so RLS keeps other members' share calcs and
 * any private budget out of reach, and neither output has a field that could carry them.
 */
import type { ToolContext, ToolRegistry } from '@cp/ai';
import { withUser } from '@cp/db';
import { DomainError, hoursSchema, toLocalWallTime, type Hours } from '@cp/domain';
import { localMinute, preDraftFit, type FitStatus, type LocalWindow } from '@cp/planner';
import type pg from 'pg';

import { loadPlanCostContext, previewCostOps, toChangeSetOps } from './preview';

/** How long a place visit is assumed to take when checking whether it fits. */
export const FIT_VISIT_MINUTES = 120;
const DAY_MS = 86_400_000;

function readAs<T>(pool: pg.Pool, context: ToolContext, fn: (tx: pg.PoolClient) => Promise<T>) {
  return withUser(pool, context.uid, 'guide', fn);
}

function tripDates(start: string, end: string): string[] {
  const dates: string[] = [];
  for (let t = Date.parse(start); t <= Date.parse(end); t += DAY_MS) {
    dates.push(new Date(t).toISOString().slice(0, 10));
  }
  return dates;
}

interface FitInput {
  readonly trip_id: string;
  readonly poi_id: string;
  readonly day?: number | undefined;
}

interface FitOutput {
  readonly status: 'fits' | 'tight' | 'no';
  readonly day: number | null;
  readonly reason_code: string;
}

async function checkFit(tx: pg.PoolClient, input: FitInput): Promise<FitOutput> {
  const trip = await tx.query<{
    start_date: string | null;
    end_date: string | null;
    tz: string | null;
    current_version_id: string | null;
  }>(
    `SELECT start_date::text AS start_date, end_date::text AS end_date, tz, current_version_id
       FROM trips WHERE id = $1`,
    [input.trip_id],
  );
  const t = trip.rows[0];
  if (!t) throw new DomainError('NOT_FOUND', { reason: 'trip_not_found' });
  const poi = await tx.query<{ hours: unknown; timezone: string | null }>(
    'SELECT hours, timezone FROM pois WHERE id = $1',
    [input.poi_id],
  );
  const place = poi.rows[0];
  if (!place) throw new DomainError('NOT_FOUND', { reason: 'poi_not_found' });
  if (!t.start_date || !t.end_date)
    return { status: 'tight', day: null, reason_code: 'DATES_UNKNOWN' };
  const parsed = hoursSchema.safeParse(place.hours);
  const hours: Hours | null = parsed.success ? parsed.data : null;
  if (!hours || Object.keys(hours.weekly).length === 0) {
    return { status: 'tight', day: null, reason_code: 'HOURS_UNKNOWN' };
  }
  const tz = place.timezone ?? t.tz ?? 'UTC';
  const dates = tripDates(t.start_date, t.end_date);
  // Day numbers exist only once the crew can see a plan; before that the fit is dates and hours.
  const busy: Record<string, LocalWindow[]> = {};
  if (t.current_version_id) {
    const items = await tx.query<{ starts_at: Date; ends_at: Date; tz: string | null }>(
      `SELECT starts_at, ends_at, tz FROM plan_items
        WHERE version_id = $1 AND starts_at IS NOT NULL AND ends_at IS NOT NULL`,
      [t.current_version_id],
    );
    for (const item of items.rows) {
      const itemTz = item.tz ?? tz;
      const { date } = toLocalWallTime(item.starts_at, itemTz);
      (busy[date] ??= []).push({
        startMin: localMinute(item.starts_at, itemTz),
        endMin: Math.max(
          localMinute(item.ends_at, itemTz),
          localMinute(item.starts_at, itemTz) + 1,
        ),
      });
    }
  }
  const candidates =
    t.current_version_id && input.day !== undefined ? dates.slice(input.day - 1, input.day) : dates;
  if (candidates.length === 0) return { status: 'no', day: null, reason_code: 'DAY_OUTSIDE_TRIP' };
  const fitOn = (days: readonly string[], withPlan: boolean): FitStatus =>
    preDraftFit({
      hours,
      durationMin: FIT_VISIT_MINUTES,
      dates: days,
      ...(withPlan ? { busy } : {}),
    });
  const status = fitOn(candidates, true);
  if (status === 'clash') {
    const closed = fitOn(candidates, false) === 'clash';
    return { status: 'no', day: null, reason_code: closed ? 'CLOSED_AT_TIME' : 'OVERLAP' };
  }
  let day: number | null = null;
  if (t.current_version_id) {
    const first = candidates.findIndex((d) => fitOn([d], true) !== 'clash');
    day = first < 0 ? null : dates.indexOf(candidates[first] as string) + 1;
  }
  return {
    status: status === 'fits' ? 'fits' : 'tight',
    day,
    reason_code: status === 'fits' ? 'OK' : 'TIGHT',
  };
}

export function registerCostToolExecutors(registry: ToolRegistry, pool: pg.Pool): void {
  // The asking member's own per-person change; nobody else's share or options are read.
  registry.registerToolExecutor('cost_quote', (input, context) =>
    readAs(pool, context, async (tx) => {
      const planContext = await loadPlanCostContext(tx, input.trip_id);
      const preview = previewCostOps(planContext, toChangeSetOps(input.ops), context.uid);
      return {
        delta_per_person_minor: preview.mine?.delta_minor ?? preview.each_minor ?? 0,
        currency: preview.currency,
      };
    }),
  );
  registry.registerToolExecutor('fit_check', (input, context) =>
    readAs(pool, context, (tx) => checkFit(tx, input)),
  );
}
