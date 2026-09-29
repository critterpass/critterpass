/**
 * Category and name suggestions for a new expense from where the crew is in the plan right now:
 * the plan item that started most recently (within four hours), its place's name and a category
 * read from its own category words. A deterministic lookup; no model is asked.
 */
import type { ExpenseCategory } from '@cp/domain';

import type { PlanItemRow } from '../data/queries';

const WORDS: readonly (readonly [ExpenseCategory, RegExp])[] = [
  ['food', /food|meal|eat|lunch|dinner|breakfast|brunch|cafe|coffee|restaurant|drink|bar|market/u],
  ['stays', /stay|hotel|lodg|villa|hostel|room|accommodation/u],
  ['transit', /transit|transport|flight|ride|taxi|boat|ferry|train|bus|transfer|scooter|car/u],
  ['fun', /fun|activity|sight|tour|attraction|museum|temple|beach|dive|snorkel|show|class|spa/u],
];

export function categoryFromWords(text: string | null | undefined): ExpenseCategory | null {
  if (text === null || text === undefined) return null;
  const lower = text.toLowerCase();
  return WORDS.find(([, pattern]) => pattern.test(lower))?.[0] ?? null;
}

export interface PlanSuggestion {
  readonly category: ExpenseCategory;
  readonly description: string;
}

/** How long after a plan item starts an expense is still likely to be for it. */
export const SUGGEST_WINDOW_MS = 4 * 60 * 60 * 1000;

/** The plan item to suggest from at `now`: the latest one that started in the last four hours. */
export function currentPlanItem(items: readonly PlanItemRow[], now: Date): PlanItemRow | null {
  const started = items.filter((item) => {
    if (item.starts_at === null) return false;
    const at = Date.parse(item.starts_at);
    return at <= now.getTime() && now.getTime() - at <= SUGGEST_WINDOW_MS;
  });
  return started[started.length - 1] ?? null;
}

export function suggestFromPlan(items: readonly PlanItemRow[], now: Date): PlanSuggestion | null {
  const item = currentPlanItem(items, now);
  if (item === null) return null;
  const category = categoryFromWords(item.category) ?? 'other';
  return { category, description: item.poi_name ?? '' };
}
