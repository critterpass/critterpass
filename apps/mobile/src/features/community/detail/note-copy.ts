/**
 * The guide's note on a shared plan, worded here from the server's counts (the numbers are never
 * the model's): how many of the plan's days touch places the crew already has, and the day with
 * the most new ones.
 */
import type { SharedPlanGuideNote } from '@cp/domain';
import { plural, t } from '@lingui/core/macro';

export function noteLine(note: SharedPlanGuideNote): string {
  const overlap = note.overlap_days.length;
  const best = note.best_day;
  if (overlap === 0 && best === null) {
    return t({
      id: 'community.note.nothingNew',
      message: 'Nothing here your trip does not have already.',
    });
  }
  if (overlap === 0) {
    return t({
      id: 'community.note.allNew',
      message: `None of this is on your trip yet. Day ${best} is the one to steal.`,
    });
  }
  const days = t({
    id: 'community.note.overlapDays',
    message: plural(overlap, {
      one: 'One of these days overlaps with your trip.',
      other: '# of these days overlap with your trip.',
    }),
  });
  if (best === null) return days;
  return t({ id: 'community.note.withBest', message: `${days} Day ${best} alone is worth it.` });
}
