/**
 * What the organiser's own words ask of a redrafted day beyond the reason chips, where code can
 * hold the answer to it. "Less walking" ("bớt đi bộ", with or without its marks): the guide is
 * told how much the day walks now; the new day's walking is measured the same way, and when it
 * has not come down the summary says so instead of passing over what she asked. A slower pace
 * ("chậm hơn", "a slow afternoon") and a late start ("ngủ nướng", "sleep in") count as the chips
 * of the same name, so the planner holds them whichever way she asked.
 */
import type { DraftDay, RedraftReasonKey } from '@cp/domain';
import { metresBetween } from '@cp/planner';

import type { RedraftPlanInput } from './redraft-input';

/** Two stops this close are walked between (the plan screen's own threshold). */
const WALK_MAX_M = 1200;
const LESS_WALKING =
  /\b(less|fewer|no|not (so|too|as) much|shorter) walk(s|ing)?\b|\bwalk(ing)? less\b|\b(bot|it|do|giam|khong|ngai|han che|tranh) di bo\b/u;

const SLOWER =
  /\b(slow(er)?|relax(ed|ing)?|lazy|chill(ed|y)?|take it easy|easy ?going|unhurried|less (packed|rushed|busy)|fewer (stops|things|places)|not (so|too|as) (busy|packed|rushed))\b|\b(cham (hon|lai|rai|thoi)|di cham|nhip cham|thong tha|nhe nhang|thu gian|nghi ngoi|it (diem|cho) (hon|thoi)|bot (diem|lich|cho)|khong voi|tu tu)\b/u;
const LATER_START =
  /\b(sleep(ing)? in|lie[ -]in|late (start|morning|breakfast)|start(ing)? (late|later)|later start|no early (start|morning)|not (too )?early|slow morning)\b|\b(ngu nuong|ngu (them|du|muon)|di muon|day muon|sang muon|bat dau muon|xuat phat muon|khong (di|day) som|dung som)\b/u;

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

/** The reason chips the organiser's note asks for in her own words (see the file header). */
export function noteReasons(note: string | null): RedraftReasonKey[] {
  if (note === null) return [];
  const said = unmarked(note);
  return [
    ...(SLOWER.test(said) ? (['slower'] as const) : []),
    ...(LATER_START.test(said) ? (['later_start'] as const) : []),
  ];
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
