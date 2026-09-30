/**
 * When the crew's plan moved under a member's personal change (3e-3 "clashes with the crew plan"):
 * the item they changed for themselves is gone from the group plan, or its day or time changed
 * since they made the change (the op's `before` snapshot). The member then keeps their version or
 * drops it. Skipping an item never clashes: skipping stays skipping whatever the crew does.
 */
import type { ChangeSetOp, PlanStateItem } from '@cp/domain';

export const OVERLAY_CLASH_KINDS = ['removed_by_crew', 'changed_by_crew'] as const;
export type OverlayClashKind = (typeof OVERLAY_CLASH_KINDS)[number];

/** Fields whose change under a personal edit is a clash: where and when the item happens. */
const WATCHED = ['day_no', 'starts_at', 'ends_at', 'lane'] as const;

function sameValue(a: unknown, b: unknown): boolean {
  if (typeof a === 'string' && typeof b === 'string' && !Number.isNaN(Date.parse(a))) {
    return /\d{4}-\d{2}-\d{2}T/.test(a) ? Date.parse(a) === Date.parse(b) : a === b;
  }
  return (a ?? null) === (b ?? null);
}

export function clashOf(
  op: ChangeSetOp,
  groupItem: PlanStateItem | undefined,
): OverlayClashKind | null {
  if (op.op === 'add' || op.op === 'remove') return null;
  if (groupItem === undefined) return 'removed_by_crew';
  const before = op.before;
  if (before === undefined || before === null) return null;
  const fields = new Set<string>([
    ...WATCHED,
    ...Object.keys(op.after ?? {}).filter((key) => key !== 'attendee_ids'),
  ]);
  for (const field of fields) {
    if (!(field in before)) continue;
    const was = (before as Record<string, unknown>)[field];
    const now = (groupItem as Record<string, unknown>)[field];
    if (!sameValue(was, now)) return 'changed_by_crew';
  }
  return null;
}
