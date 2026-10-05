/**
 * The stops an edit pushed later to make room for one stop, as the plan version keeps them
 * (`itinerary_versions.pushes`, docs/api-contracts.md §4.6): what an edit sends with its ops, and,
 * when that stop is later taken off its day, the ops that put exactly those stops back. A record
 * only counts while every stop it pushed still sits where the push left it.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and table names, never copy. */
import { planPushesSchema, type PlanOp, type PlanPush, type PlanState } from '@cp/domain';
import { useMemo } from 'react';

import { useLiveRows } from './live-rows';

const PUSHES_SQL = 'SELECT pushes FROM itinerary_versions WHERE id = ?';

/** The push an edit's ops make for `cause`: every other stop they move, with the time it had. */
export function pushOf(
  cause: string,
  ops: readonly PlanOp[],
  state: PlanState,
): PlanPush | undefined {
  const byId = new Map(state.items.map((item) => [item.stable_id, item]));
  const items = ops.flatMap((op) => {
    if (op.op !== 'move' || op.item === cause) return [];
    const was = byId.get(op.item);
    if (was?.starts_at === undefined || was.ends_at === undefined) return [];
    return [{ stable_id: op.item, from: { starts_at: was.starts_at, ends_at: was.ends_at } }];
  });
  return items.length === 0 ? undefined : { cause, items };
}

const same = (a: string | undefined, b: string | undefined) =>
  a !== undefined && b !== undefined && Date.parse(a) === Date.parse(b);

/**
 * The moves that put back the stops `cause` pushed, or null when there is no record for it or one
 * of those stops has moved since (the plan on this phone, queued edits included, decides).
 */
export function pushedBackOps(
  pushes: readonly PlanPush[],
  cause: string,
  state: PlanState,
): PlanOp[] | null {
  const push = [...pushes].reverse().find((record) => record.cause === cause);
  if (push === undefined) return null;
  const byId = new Map(state.items.map((item) => [item.stable_id, item]));
  const ops: PlanOp[] = [];
  for (const pushed of push.items) {
    const item = byId.get(pushed.stable_id);
    if (pushed.to === undefined || item === undefined) return null;
    if (!same(item.starts_at, pushed.to.starts_at) || !same(item.ends_at, pushed.to.ends_at)) {
      return null;
    }
    ops.push({ op: 'move', item: pushed.stable_id, new: { ...pushed.from } });
  }
  return ops;
}

/** The plan version's kept pushes. */
export function useVersionPushes(versionId: string | null): readonly PlanPush[] {
  const rows = useLiveRows<{ pushes: string | null }>(
    PUSHES_SQL,
    versionId === null ? null : [versionId],
    ['itinerary_versions'],
  );
  const raw = rows.rows[0]?.pushes ?? null;
  return useMemo(() => {
    if (raw === null) return [];
    try {
      const parsed = planPushesSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : [];
    } catch {
      return [];
    }
  }, [raw]);
}
