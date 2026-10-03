/**
 * Crowds for fit: each place's typical week, one curve per weekday by the shared source rule
 * (what crews saw, then an approved editorial week, then a bought forecast), and the month's
 * factor from the destination's reviewed crowd index (an average month = 1). Only the two sources
 * the app may name reach fit: a bought forecast is shown elsewhere, never quoted as a reason.
 */
import { pickCrowdCurve } from '@cp/domain';
import type { FitCrowds } from '@cp/planner';
import type pg from 'pg';

interface CurveRow {
  readonly poi_id: string;
  readonly dow: number;
  readonly hourly: number[];
  readonly source: string;
  readonly approved_at: Date | null;
}

/** The weekly curve per place, or nothing for a place with no curve that may be quoted. */
export function crowdWeeks(rows: readonly CurveRow[]): Map<string, FitCrowds> {
  const byPlace = new Map<string, CurveRow[]>();
  for (const row of rows) byPlace.set(row.poi_id, [...(byPlace.get(row.poi_id) ?? []), row]);
  const weeks = new Map<string, FitCrowds>();
  for (const [poiId, placeRows] of byPlace) {
    const days = Array.from({ length: 7 }, (_, dow) =>
      pickCrowdCurve(placeRows.filter((row) => row.dow === dow)),
    );
    const source = days.find((day) => day !== null)?.source;
    if (source !== 'visits' && source !== 'editorial') continue;
    weeks.set(poiId, {
      source,
      week: days.map((day) => (day !== null && day.source === source ? day.hourly : null)),
    });
  }
  return weeks;
}

export async function readCrowdWeeks(
  tx: pg.PoolClient,
  poiIds: readonly string[],
): Promise<Map<string, FitCrowds>> {
  if (poiIds.length === 0) return new Map();
  const { rows } = await tx.query<CurveRow>(
    `SELECT poi_id, dow, hourly, source, approved_at FROM crowd_forecasts
      WHERE poi_id = ANY($1::uuid[]) AND source IN ('visits', 'editorial')`,
    [poiIds],
  );
  return crowdWeeks(rows);
}

const MIN_FACTOR = 0.6;
const MAX_FACTOR = 1.4;

/** The month's crowd factor against the destination's average month; 1 without reviewed data. */
export function monthFactors(rows: readonly { month: number; crowd_index: number }[]) {
  const mean = rows.reduce((sum, row) => sum + row.crowd_index, 0) / Math.max(1, rows.length);
  const factors = new Map<number, number>();
  if (mean <= 0) return factors;
  for (const row of rows) {
    factors.set(row.month, Math.min(MAX_FACTOR, Math.max(MIN_FACTOR, row.crowd_index / mean)));
  }
  return factors;
}

export async function readMonthFactors(
  tx: pg.PoolClient,
  destinationId: string | null,
): Promise<Map<number, number>> {
  if (destinationId === null) return new Map();
  const { rows } = await tx.query<{ month: number; crowd_index: number }>(
    `SELECT month, crowd_index FROM season_months
      WHERE destination_id = $1 AND reviewed_at IS NOT NULL`,
    [destinationId],
  );
  return monthFactors(rows);
}
