/**
 * The stops an edit pushed later, kept on each plan version while they can still be put back
 * exactly (docs/api-contracts.md §4.6 `apply_plan_ops.pushed`). A record lives only while its
 * cause stop is still in the plan and every stop it pushed still sits at the time the push gave
 * it on the same day: a hand edit of one of them, a day reorder, or another push that moves them
 * ends it, as putting them back would then overwrite a later change.
 */
import { planPushesSchema, type PlanPush, type PlanState, type PlanStateItem } from '@cp/domain';
import type pg from 'pg';

const sameInstant = (a: string | undefined, b: string | undefined) =>
  a !== undefined && b !== undefined && Date.parse(a) === Date.parse(b);

/** A stored `pushes` value as records; anything unreadable counts as none. */
export function readPushes(raw: unknown): PlanPush[] {
  const parsed = planPushesSchema.safeParse(raw ?? []);
  return parsed.success ? parsed.data : [];
}

function stillHolds(
  push: PlanPush,
  items: ReadonlyMap<string, PlanStateItem>,
  dayOf: ReadonlyMap<string, number>,
): boolean {
  if (!items.has(push.cause)) return false;
  return push.items.every((pushed) => {
    const item = items.get(pushed.stable_id);
    return (
      item !== undefined &&
      pushed.to !== undefined &&
      item.day_no === dayOf.get(pushed.stable_id) &&
      sameInstant(item.starts_at, pushed.to.starts_at) &&
      sameInstant(item.ends_at, pushed.to.ends_at)
    );
  });
}

/**
 * The records the new version keeps: the base version's that still hold in `next`, then the
 * edit's own push (stamped with where each stop now sits). A newer push of the same cause
 * replaces an older one.
 */
export function carryPushes(
  base: readonly PlanPush[],
  baseState: PlanState,
  next: PlanState,
  added: PlanPush | null,
): PlanPush[] {
  const items = new Map(next.items.map((item) => [item.stable_id, item]));
  const baseDays = new Map(baseState.items.map((item) => [item.stable_id, item.day_no]));
  const kept = base.filter(
    (push) => push.cause !== added?.cause && stillHolds(push, items, baseDays),
  );
  if (added === null) return kept;
  const stamped: PlanPush['items'] = added.items.flatMap((pushed) => {
    const item = items.get(pushed.stable_id);
    if (item?.starts_at === undefined || item.ends_at === undefined) return [];
    // Nothing to put back for a stop the edit did not actually move.
    if (sameInstant(item.starts_at, pushed.from.starts_at)) return [];
    return [{ ...pushed, to: { starts_at: item.starts_at, ends_at: item.ends_at } }];
  });
  if (stamped.length === 0 || !items.has(added.cause)) return kept;
  return [...kept, { cause: added.cause, items: stamped }].slice(-50);
}

/**
 * Writes the new version's records: the base version's that still hold, plus this edit's own
 * (the caller runs as the system role, inside the version write).
 */
export async function writePushes(
  tx: pg.PoolClient,
  versionId: string,
  edit: {
    readonly baseVersionId: string;
    readonly next: PlanState;
    readonly pushed?: PlanPush | null;
  },
  loadState: (tx: pg.PoolClient, versionId: string) => Promise<PlanState>,
): Promise<void> {
  const { rows } = await tx.query<{ pushes: unknown }>(
    'SELECT pushes FROM itinerary_versions WHERE id = $1',
    [edit.baseVersionId],
  );
  const baseState = await loadState(tx, edit.baseVersionId);
  const pushes = carryPushes(
    readPushes(rows[0]?.pushes),
    baseState,
    edit.next,
    edit.pushed ?? null,
  );
  await tx.query('UPDATE itinerary_versions SET pushes = $2 WHERE id = $1', [
    versionId,
    pushes.length === 0 ? null : JSON.stringify(pushes),
  ]);
}
