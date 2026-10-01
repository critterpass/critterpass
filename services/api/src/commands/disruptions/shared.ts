/**
 * What the disruption commands share: the disruption as the caller sees it (RLS: a trip member),
 * who counts as its organiser, and writing its rows back with a `disruption.step` hint on
 * `trip_watch:{trip}` for each row that moved. Lookups run as the caller; writes switch to
 * app_system through `asSystemRole` after the check.
 */
import { outbox } from '@cp/db';
import {
  channelName,
  disruptionActionsSchema,
  DomainError,
  type DisruptionAction,
} from '@cp/domain';
import type pg from 'pg';

export interface DisruptionView {
  readonly id: string;
  readonly trip_id: string;
  readonly crew_id: string;
  readonly guide_id: string | null;
  readonly kind: string;
  readonly status: string;
  readonly title: string;
  readonly summary: string;
  readonly traveller_ids: string[];
  readonly options: unknown[];
  readonly chosen_option_id: string | null;
  readonly actions: DisruptionAction[];
  readonly organiser: boolean;
}

/** The disruption as the caller sees it; missing or not theirs → NOT_FOUND. */
export async function requireDisruption(
  tx: pg.PoolClient,
  disruptionId: string,
  uid: string,
): Promise<DisruptionView> {
  const { rows } = await tx.query<Omit<DisruptionView, 'actions'> & { actions: unknown }>(
    `SELECT d.id, d.trip_id, t.crew_id, t.guide_id, d.kind, d.status, d.title, d.summary,
            d.options, d.chosen_option_id, d.actions,
            coalesce(ARRAY(SELECT jsonb_array_elements_text(d.affected -> 'traveller_ids')), '{}')
              AS traveller_ids,
            EXISTS (SELECT 1 FROM crew_members m WHERE m.crew_id = t.crew_id AND m.user_id = $2
                     AND m.role = 'organiser' AND m.left_at IS NULL) AS organiser
       FROM disruptions d JOIN trips t ON t.id = d.trip_id
      WHERE d.id = $1`,
    [disruptionId, uid],
  );
  const row = rows[0];
  if (row === undefined) throw new DomainError('NOT_FOUND', { reason: 'disruption' });
  return { ...row, actions: disruptionActionsSchema.parse(row.actions) };
}

export function requireRow(view: DisruptionView, actionId: string): DisruptionAction {
  const row = view.actions.find((action) => action.id === actionId);
  if (row === undefined) throw new DomainError('NOT_FOUND', { reason: 'action' });
  return row;
}

/** Writes the rows back (as app_system) and announces the ones that moved. */
export async function saveRows(
  tx: pg.PoolClient,
  view: Pick<DisruptionView, 'id' | 'trip_id'>,
  rows: readonly DisruptionAction[],
  moved: readonly DisruptionAction[],
): Promise<void> {
  await tx.query('UPDATE disruptions SET actions = $2::jsonb WHERE id = $1', [
    view.id,
    JSON.stringify(disruptionActionsSchema.parse(rows)),
  ]);
  for (const row of moved) {
    await outbox(tx, channelName('trip_watch', view.trip_id), 'disruption.step', {
      disruption_id: view.id,
      action_id: row.id,
      state: row.state,
    });
  }
}
