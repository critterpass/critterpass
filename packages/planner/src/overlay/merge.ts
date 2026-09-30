/**
 * The member's own plan (docs/product-decisions.md, personal overlay): the crew's current version
 * with their active personal ops laid over it. Their items are tagged `just_you`; an item they skip
 * leaves their view (the crew only sees them drop off its attendees); an item they changed shows
 * their version, marked with a clash when the crew's plan moved under it. Pure: the device merges
 * on every sync, the calendar feed on every read.
 */
import type { ChangeSetOp, PlanState, PlanStateItem } from '@cp/domain';

import { clashOf, type OverlayClashKind } from './conflicts';

export interface OverlayRow {
  readonly id: string;
  readonly ops: readonly ChangeSetOp[];
  readonly status: 'active' | 'dropped';
}

export interface OverlayClash {
  readonly personalOpsId: string;
  readonly stableId: string;
  readonly kind: OverlayClashKind;
}

export type OverlayItem = PlanStateItem & {
  readonly just_you: boolean;
  readonly clash: OverlayClash | null;
};

export interface OverlayPlan {
  readonly days: PlanState['days'];
  readonly items: readonly OverlayItem[];
  /** Group items the member skips. */
  readonly skipped: readonly string[];
  readonly clashes: readonly OverlayClash[];
}

export function mergeOverlay(
  group: PlanState,
  rows: readonly OverlayRow[],
  uid: string,
): OverlayPlan {
  const groupById = new Map(group.items.map((item) => [item.stable_id, item]));
  const items = new Map<string, OverlayItem>(
    group.items.map((item) => [item.stable_id, { ...item, just_you: false, clash: null }]),
  );
  const skipped = new Set<string>();
  const clashes: OverlayClash[] = [];
  for (const row of rows) {
    if (row.status !== 'active') continue;
    for (const op of row.ops) {
      if (op.accepted === false) continue;
      const groupItem = groupById.get(op.target);
      if (op.op === 'remove') {
        if (items.delete(op.target) && groupItem !== undefined) skipped.add(op.target);
        continue;
      }
      // A later op on the same item wins over an earlier skip.
      skipped.delete(op.target);
      if (op.op === 'add') {
        items.set(op.target, {
          ...(op.after ?? {}),
          day_no: op.after?.day_no ?? 1,
          stable_id: op.target,
          attendee_ids: [uid],
          just_you: true,
          clash: null,
        });
        continue;
      }
      const kind = clashOf(op, groupItem);
      const clash = kind === null ? null : { personalOpsId: row.id, stableId: op.target, kind };
      if (clash !== null) clashes.push(clash);
      const start = items.get(op.target) ?? groupItem ?? { ...(op.before ?? {}), day_no: 1 };
      items.set(op.target, {
        ...start,
        ...(op.after ?? {}),
        day_no: op.after?.day_no ?? start.day_no,
        stable_id: op.target,
        just_you: true,
        clash,
      });
    }
  }
  return { days: group.days, items: [...items.values()], skipped: [...skipped], clashes };
}
