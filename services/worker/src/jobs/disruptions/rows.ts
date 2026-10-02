/**
 * Reading and writing a disruption's rows (`disruptions.actions`). Every write bumps nothing but
 * the rows themselves; each state change is announced on `trip_watch:{trip}` as `disruption.step`
 * so an open 3k-5 ticks the row on the real outcome, and the synced row follows.
 */
import { outbox } from '@cp/db';
import {
  channelName,
  disruptionActionsSchema,
  type DisruptionAction,
  type DisruptionActionState,
} from '@cp/domain';
import type pg from 'pg';

export interface DisruptionRow {
  readonly id: string;
  readonly trip_id: string;
  readonly crew_id: string;
  readonly kind: string;
  readonly cause: string;
  readonly status: string;
  readonly version: number;
  readonly title: string;
  readonly summary: string;
  readonly facts: Record<string, string | number>;
  readonly affected: { traveller_ids?: string[]; unaffected_ids?: string[] };
  readonly options: unknown[];
  readonly actions: DisruptionAction[];
  readonly guide_id: string | null;
  readonly organiser_ids: string[];
}

export async function lockDisruption(
  tx: pg.PoolClient,
  id: string,
): Promise<DisruptionRow | undefined> {
  const { rows } = await tx.query<Omit<DisruptionRow, 'actions'> & { actions: unknown }>(
    `SELECT d.id, d.trip_id, t.crew_id, d.kind, d.cause, d.status, d.version, d.title, d.summary,
            d.facts, d.affected, d.options, d.actions, t.guide_id,
            coalesce((SELECT array_agg(m.user_id ORDER BY m.user_id) FROM crew_members m
                       WHERE m.crew_id = t.crew_id AND m.role = 'organiser' AND m.left_at IS NULL),
                     '{}') AS organiser_ids
       FROM disruptions d JOIN trips t ON t.id = d.trip_id
      WHERE d.id = $1 FOR UPDATE OF d`,
    [id],
  );
  const row = rows[0];
  if (row === undefined) return undefined;
  return { ...row, actions: disruptionActionsSchema.parse(row.actions) };
}

export async function saveActions(
  tx: pg.PoolClient,
  disruption: Pick<DisruptionRow, 'id' | 'trip_id'>,
  actions: readonly DisruptionAction[],
  changed: readonly DisruptionAction[] = [],
): Promise<void> {
  await tx.query('UPDATE disruptions SET actions = $2::jsonb WHERE id = $1', [
    disruption.id,
    JSON.stringify(disruptionActionsSchema.parse(actions)),
  ]);
  for (const action of changed) {
    await outbox(tx, channelName('trip_watch', disruption.trip_id), 'disruption.step', {
      disruption_id: disruption.id,
      action_id: action.id,
      state: action.state,
    });
  }
}

/** Sets one row's state (and any fields) and announces it; unknown ids change nothing. */
export async function moveRow(
  tx: pg.PoolClient,
  disruption: DisruptionRow,
  match: (action: DisruptionAction) => boolean,
  state: DisruptionActionState,
  fields: Partial<DisruptionAction> = {},
): Promise<DisruptionAction[]> {
  const changed: DisruptionAction[] = [];
  const next = disruption.actions.map((action) => {
    if (!match(action) || action.state === state) return action;
    const moved = { ...action, ...fields, state };
    changed.push(moved);
    return moved;
  });
  if (changed.length > 0) {
    // Later moves in the same transaction build on this one.
    disruption.actions.splice(0, disruption.actions.length, ...next);
    await saveActions(tx, disruption, next, changed);
  }
  return changed;
}

/** Open disruptions whose rows point at `column = value`, locked. */
export async function disruptionsWhere(
  tx: pg.PoolClient,
  field: 'guide_action_id' | 'vendor_message_id' | 'poll',
  value: string,
): Promise<DisruptionRow[]> {
  const probe =
    field === 'poll'
      ? JSON.stringify([{ poll: { id: value } }])
      : JSON.stringify([{ [field]: value }]);
  const { rows } = await tx.query<{ id: string }>(
    `SELECT id FROM disruptions WHERE actions @> $1::jsonb ORDER BY id`,
    [probe],
  );
  const found: DisruptionRow[] = [];
  for (const row of rows) {
    const locked = await lockDisruption(tx, row.id);
    if (locked !== undefined) found.push(locked);
  }
  return found;
}
