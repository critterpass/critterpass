/**
 * Crowds for fit: each place's typical week by the shared source rule (what crews saw, then an
 * approved editorial week; a bought forecast is never quoted as a reason) and the month's factor
 * from the destination's reviewed crowd index.
 */
import { crowdWeeks, monthFactors, type CrowdCurveRow, type FitCrowds } from '@cp/planner';
import type pg from 'pg';

export async function readCrowdWeeks(
  tx: pg.PoolClient,
  poiIds: readonly string[],
): Promise<Map<string, FitCrowds>> {
  if (poiIds.length === 0) return new Map();
  const { rows } = await tx.query<CrowdCurveRow>(
    `SELECT poi_id, dow, hourly, source, approved_at FROM crowd_forecasts
      WHERE poi_id = ANY($1::uuid[]) AND source IN ('visits', 'editorial')`,
    [poiIds],
  );
  return crowdWeeks(rows);
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
