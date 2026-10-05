/**
 * What the organiser's own words ask of a redrafted day beyond the reason chips, where code can
 * hold the answer to it: "less walking" ("bớt đi bộ", with or without its marks). The guide is
 * told how much the day walks now; the new day's walking is measured the same way, and when it
 * has not come down the summary says so instead of passing over what she asked.
 */
import type { DraftDay } from '@cp/domain';
import { metresBetween } from '@cp/planner';

import type { RedraftPlanInput } from './redraft-input';

/** Two stops this close are walked between (the plan screen's own threshold). */
const WALK_MAX_M = 1200;
const LESS_WALKING =
  /\b(less|fewer|no|not (so|too|as) much|shorter) walk(s|ing)?\b|\bwalk(ing)? less\b|\b(bot|it|do|giam|khong|ngai|han che|tranh) di bo\b/u;

const unmarked = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/[đĐ]/gu, 'd')
    .toLowerCase();

/** Whether the organiser's note asks for a day with less walking. */
export function wantsLessWalking(input: Pick<RedraftPlanInput, 'note'>): boolean {
  return input.note !== null && LESS_WALKING.test(unmarked(input.note));
}

/** The metres walked between the day's stops: every hop short enough to be a walk. */
export function walkedMetres(input: Pick<RedraftPlanInput, 'pois'>, day: DraftDay): number {
  let metres = 0;
  day.items.forEach((item, index) => {
    const before = day.items[index - 1];
    const a = before?.poi_id == null ? undefined : input.pois.get(before.poi_id);
    const b = item.poi_id === null ? undefined : input.pois.get(item.poi_id);
    if (a === undefined || b === undefined) return;
    const hop = metresBetween(a, b);
    if (hop <= WALK_MAX_M) metres += hop;
  });
  return Math.round(metres);
}

/** What the guide is told when she asked for less walking. */
export function lessWalkingTarget(input: RedraftPlanInput, day: DraftDay): string {
  const walks = day.items.filter((item, index) => {
    const before = day.items[index - 1];
    const a = before?.poi_id == null ? undefined : input.pois.get(before.poi_id);
    const b = item.poi_id === null ? undefined : input.pois.get(item.poi_id);
    return a !== undefined && b !== undefined && metresBetween(a, b) <= WALK_MAX_M;
  }).length;
  return `Less walking means less walking between stops than now (the day has ${walks} walks, about ${walkedMetres(input, day)} metres): take out or swap a stop that is reached on foot, or put a ride where a walk was. If you cannot, say so plainly in the summary.`;
}
