/**
 * A plan version as the planner's pure state, for the worker's change set sweeps. Mirrors the
 * api's loader (services/api/src/plan/versioning.ts): same columns, stripped of nulls so two reads
 * of one version always compare equal.
 */
import type { PlanState, PlanStateItem } from '@cp/domain';
import type pg from 'pg';

export async function loadPlanState(tx: pg.PoolClient, versionId: string): Promise<PlanState> {
  const days = await tx.query<{
    day_no: number;
    date: string | null;
    theme: string | null;
    destination_id: string | null;
  }>(
    `SELECT day_no, to_char(date, 'YYYY-MM-DD') AS date, theme, destination_id FROM plan_days
      WHERE version_id = $1 ORDER BY day_no`,
    [versionId],
  );
  const items = await tx.query<{ item: PlanStateItem }>(
    `SELECT jsonb_strip_nulls(jsonb_build_object(
              'stable_id', i.stable_id, 'day_no', d.day_no,
              'starts_at', to_char(i.starts_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
              'ends_at', to_char(i.ends_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
              'tz', i.tz, 'lane', i.lane, 'attendee_ids', i.attendee_ids, 'poi_id', i.poi_id,
              'provider_id', i.provider_id, 'booking_id', i.booking_id, 'must_do_id', i.must_do_id,
              'category', i.category, 'cost_model', i.cost_model, 'amount_minor', i.amount_minor,
              'currency', i.currency, 'status', i.status, 'flexibility', i.flexibility,
              'is_outdoor', i.is_outdoor, 'created_by_kind', i.created_by_kind, 'notes', i.notes,
              'locked_reason', i.locked_reason)) AS item
       FROM plan_items i JOIN plan_days d ON d.id = i.day_id
      WHERE i.version_id = $1`,
    [versionId],
  );
  return {
    // A day with no area of its own carries no area key, so states read before areas compare equal.
    days: days.rows.map(({ destination_id, ...day }) =>
      destination_id === null ? day : { ...day, destination_id },
    ),
    items: items.rows.map((row) => row.item),
  };
}
