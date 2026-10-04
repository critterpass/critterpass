/**
 * The plan version a person's plan screens show and edit: the crew's version once there is one,
 * and before that the organiser's private draft, for organisers only. A member has no plan to see
 * until the proposal goes out.
 */
import type pg from 'pg';

/** SQL for that version's id, over `trips t`, read as the caller. */
export const VISIBLE_PLAN_VERSION_SQL = `coalesce(t.current_version_id,
  CASE WHEN app.is_trip_organiser(t.id) THEN t.draft_version_id END)`;

export interface VisiblePlanVersion {
  readonly id: string;
  /** `draft`: the organiser's own, edited with `apply_draft_ops`. */
  readonly kind: 'crew' | 'draft';
}

export async function visiblePlanVersion(
  tx: pg.PoolClient,
  tripId: string,
): Promise<VisiblePlanVersion | null> {
  const { rows } = await tx.query<{ id: string | null; crew: boolean }>(
    `SELECT ${VISIBLE_PLAN_VERSION_SQL} AS id, t.current_version_id IS NOT NULL AS crew
       FROM trips t WHERE t.id = $1 AND app.is_trip_member(t.id)`,
    [tripId],
  );
  const row = rows[0];
  if (row === undefined || row.id === null) return null;
  return { id: row.id, kind: row.crew ? 'crew' : 'draft' };
}
