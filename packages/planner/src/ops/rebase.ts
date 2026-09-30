/**
 * Rebasing plan edits onto a newer version (docs/system-architecture.md §7.b). Ops carry absolute
 * values keyed by `stable_id`, so an op on an item nobody else touched means the same thing on the
 * latest version as on the one it was made against: it rebases unchanged. An op on an item that
 * changed in between, or any op alongside a day reorder (a reorder moves every item's date), is a
 * conflict the client surfaces ("Maya moved this too") instead of guessing. The server uses the
 * same rule to keep a pending change set alive across versions or mark it stale.
 */
import {
  applyPlanEdits,
  editTargets,
  type PlanEdit,
  type PlanState,
  type PlanStateDay,
  type PlanStateItem,
} from '@cp/domain';

export type RebaseResult<Op> =
  | { readonly ok: true; readonly ops: readonly Op[] }
  | { readonly ok: false; readonly conflicts: readonly string[] };

/** What differs between two plan states: the stable ids of changed items, and `days`. */
export function changedSince(base: PlanState, latest: PlanState): Set<string> {
  const changed = new Set<string>();
  const dayKey = (days: readonly PlanStateDay[]) =>
    JSON.stringify(
      [...days].sort((a, b) => a.day_no - b.day_no).map((d) => [d.day_no, d.date, d.theme]),
    );
  if (dayKey(base.days) !== dayKey(latest.days)) changed.add('days');
  const before = new Map(base.items.map((item) => [item.stable_id, item]));
  const after = new Map(latest.items.map((item) => [item.stable_id, item]));
  for (const [id, item] of before) {
    const now = after.get(id);
    if (now === undefined || !sameItem(item, now)) changed.add(id);
  }
  for (const id of after.keys()) if (!before.has(id)) changed.add(id);
  return changed;
}

function canonical(item: PlanStateItem): string {
  const entries = Object.entries(item)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => [
      key,
      (key === 'starts_at' || key === 'ends_at') && typeof value === 'string'
        ? new Date(value).toISOString()
        : Array.isArray(value)
          ? [...(value as unknown[])].sort()
          : value,
    ])
    .sort(([a], [b]) => String(a).localeCompare(String(b)));
  return JSON.stringify(entries);
}

export function sameItem(a: PlanStateItem, b: PlanStateItem): boolean {
  return canonical(a) === canonical(b);
}

/** The keys `mine` and a concurrent change both touch; a reorder conflicts with everything. */
export function conflictsWith(
  mine: readonly PlanEdit[],
  theirs: ReadonlySet<string>,
): readonly string[] {
  const own = editTargets(mine);
  if (own.size === 0 || theirs.size === 0) return [];
  if (own.has('days') || theirs.has('days')) return ['days'];
  return [...own].filter((key) => theirs.has(key));
}

/**
 * Rebases `ops` (lowered to `edits` by the caller) from `base` onto `latest`: unchanged when no
 * key they touch moved in between, else the conflicting keys.
 */
export function rebaseOps<Op>(
  ops: readonly Op[],
  edits: readonly PlanEdit[],
  base: PlanState,
  latest: PlanState,
): RebaseResult<Op> {
  const conflicts = conflictsWith(edits, changedSince(base, latest));
  if (conflicts.length > 0) return { ok: false, conflicts };
  try {
    applyPlanEdits(latest, edits);
  } catch {
    return { ok: false, conflicts: [...editTargets(edits)] };
  }
  return { ok: true, ops };
}
