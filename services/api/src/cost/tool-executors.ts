/**
 * The guide's cost and fit tools (docs/api-contracts.md §6, docs/api-contracts-planning.md). The
 * guide only words these numbers: `cost_quote` prices proposed plan changes for the asking member
 * with `@cp/cost-engine`, and `fit_check` asks the planning fit engine (the one the places and plan
 * screens use) when a place fits, so the guide quotes the same day, slot and reasons the crew sees.
 * Both run as the asking member, so RLS keeps other members' share calcs, any private budget and
 * an organiser's draft out of reach, and neither output has a field that could carry them.
 */
import type { ToolContext, ToolRegistry } from '@cp/ai';
import { withUser } from '@cp/db';
import {
  DomainError,
  hoursSchema,
  toLocalWallTime,
  visitMinutes,
  type DayFit,
  type FitGrade,
  type FitReason,
} from '@cp/domain';
import { preDraftFit } from '@cp/planner';
import type pg from 'pg';

import { DEFAULT_FIT_DEPS } from '../planning/fit/routes';
import { fitForTrip } from '../planning/fit/service';
import { loadPlanCostContext, previewCostOps, toChangeSetOps } from './preview';

const DAY_MS = 86_400_000;
const MAX_REASONS = 12;

function readAs<T>(pool: pg.Pool, context: ToolContext, fn: (tx: pg.PoolClient) => Promise<T>) {
  return withUser(pool, context.uid, 'guide', fn);
}

interface FitInput {
  readonly trip_id: string;
  readonly poi_id: string;
  /** A plan day number; unset = the best day. */
  readonly day?: number | undefined;
}

/** What the guide may quote: the day, the slot in the trip's local time, and the reason codes. */
export interface FitCheckOutput {
  readonly grade: FitGrade;
  readonly day_no: number | null;
  /** HH:MM, local to the trip. */
  readonly starts_at: string | null;
  readonly ends_at: string | null;
  readonly reasons: readonly FitReason[];
}

const clock = (iso: string, tz: string): string =>
  toLocalWallTime(new Date(iso), tz).time.slice(0, 5);

function fromDay(day: DayFit, tz: string): FitCheckOutput {
  return {
    grade: day.grade,
    day_no: day.day_no,
    starts_at: day.slot === null ? null : clock(day.slot.starts_at, tz),
    ends_at: day.slot === null ? null : clock(day.slot.ends_at, tz),
    reasons: day.reasons,
  };
}

/** Before a plan exists there are no days to place it on: only the trip's dates and the hours. */
async function preDraftCheck(tx: pg.PoolClient, input: FitInput): Promise<FitCheckOutput> {
  const trip = await tx.query<{ start_date: string | null; end_date: string | null }>(
    'SELECT start_date::text AS start_date, end_date::text AS end_date FROM trips WHERE id = $1',
    [input.trip_id],
  );
  const poi = await tx.query<{ hours: unknown; category: string; time_needed_min: number | null }>(
    `SELECT hours, category, (editorial->>'time_needed_min')::int AS time_needed_min
       FROM pois WHERE id = $1`,
    [input.poi_id],
  );
  const place = poi.rows[0];
  if (!place) throw new DomainError('NOT_FOUND', { reason: 'poi_not_found' });
  const none = { day_no: null, starts_at: null, ends_at: null };
  const parsed = hoursSchema.safeParse(place.hours);
  const t = trip.rows[0];
  if (
    !parsed.success ||
    Object.keys(parsed.data.weekly).length === 0 ||
    !t?.start_date ||
    !t.end_date
  ) {
    return { grade: 'possible', ...none, reasons: [{ code: 'hours_unknown', params: {} }] };
  }
  const dates: string[] = [];
  for (let at = Date.parse(t.start_date); at <= Date.parse(t.end_date); at += DAY_MS) {
    dates.push(new Date(at).toISOString().slice(0, 10));
  }
  const durationMin = visitMinutes({
    category: place.category,
    timeNeededMin: place.time_needed_min,
  });
  const status = preDraftFit({ hours: parsed.data, durationMin, dates });
  const grade: FitGrade = status === 'fits' ? 'good' : status === 'clash' ? 'no' : 'possible';
  return { grade, ...none, reasons: [] };
}

async function checkFit(tx: pg.PoolClient, input: FitInput): Promise<FitCheckOutput> {
  const trip = await tx.query<{ tz: string; current_version_id: string | null }>(
    `SELECT coalesce(t.tz, d.tz, 'UTC') AS tz, t.current_version_id
       FROM trips t LEFT JOIN destinations d ON d.id = t.destination_id WHERE t.id = $1`,
    [input.trip_id],
  );
  const t = trip.rows[0];
  if (!t) throw new DomainError('NOT_FOUND', { reason: 'trip_not_found' });
  if (t.current_version_id === null) return preDraftCheck(tx, input);
  const { fits } = await fitForTrip(
    tx,
    { tripId: input.trip_id, poiIds: [input.poi_id] },
    DEFAULT_FIT_DEPS,
  );
  const fit = fits[0];
  if (!fit) throw new DomainError('NOT_FOUND', { reason: 'poi_not_found' });
  const empty = { day_no: null, starts_at: null, ends_at: null };
  if (input.day !== undefined) {
    const day = fit.days.find((entry) => entry.day_no === input.day);
    return day === undefined ? { grade: 'no', ...empty, reasons: [] } : fromDay(day, t.tz);
  }
  const best =
    fit.best === null ? undefined : fit.days.find((day) => day.day_id === fit.best?.day_id);
  if (best !== undefined) return fromDay(best, t.tz);
  // No day works: every day's reasons, so the guide can say why.
  const reasons = fit.days.flatMap((day) => day.reasons).slice(0, MAX_REASONS);
  return { grade: 'no', ...empty, reasons };
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
