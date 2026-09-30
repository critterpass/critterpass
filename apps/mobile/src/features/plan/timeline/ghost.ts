/**
 * The guide's suggestion ghost (3e-2): a weather change set still waiting on the crew that moves
 * one of this day's items, drawn where the item would go. Built from the synced `change_sets` row
 * (the guide proposes it; nothing is applied until the review screen sends or applies it).
 */
import type { ChangeSetOp } from '@cp/domain';

import { minutesOnDay, type DayItem } from '../day/plan-model';
import type { ChangesetRow } from '../day/queries';

export interface GhostSuggestion {
  readonly changesetId: string;
  readonly item: DayItem;
  readonly start: number;
  readonly end: number;
  readonly reason: string;
}

const OPEN = new Set(['draft', 'proposed', 'voting']);

export function ghostFor(
  changesets: readonly ChangesetRow[],
  items: readonly DayItem[],
  date: string,
): GhostSuggestion | null {
  for (const set of changesets) {
    if (set.trigger !== 'weather' || !OPEN.has(set.status) || set.ops === null) continue;
    let ops: ChangeSetOp[];
    try {
      ops = JSON.parse(set.ops) as ChangeSetOp[];
    } catch {
      continue;
    }
    for (const op of ops) {
      if ((op.op !== 'retime' && op.op !== 'move') || op.accepted === false) continue;
      const item = items.find((candidate) => candidate.stableId === op.target);
      const startsAt = op.after?.starts_at;
      if (item === undefined || startsAt === undefined || item.start === null || item.end === null)
        continue;
      if (op.after?.day_no !== undefined && op.after.day_no !== item.dayNo) continue;
      const start = minutesOnDay(startsAt, item.tz, date);
      const endsAt = op.after?.ends_at;
      const end =
        endsAt === undefined
          ? start + (item.end - item.start)
          : minutesOnDay(endsAt, item.tz, date);
      return { changesetId: set.id, item, start, end, reason: op.reason };
    }
  }
  return null;
}
