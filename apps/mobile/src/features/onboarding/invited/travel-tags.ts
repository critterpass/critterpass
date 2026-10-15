/**
 * The tags "2 · How you travel" offers on 3a-12: every tag the quiz knows, and the few shown before
 * + MORE (the picked ones first, prefilled from the inviter's confirmed tags, then the rest).
 */
import { TASTE_TAGS, type TasteTag } from '@cp/domain';

import { onboardingQuiz } from '../content';

const SHOWN_CHIPS = 3;

export function quizTags(): TasteTag[] {
  const seen = new Set<TasteTag>();
  for (const q of onboardingQuiz()) {
    for (const tag of [...q.left.tags, ...q.right.tags]) seen.add(tag);
  }
  return TASTE_TAGS.filter((tag) => seen.has(tag));
}

/** The chips on show: all of them after + MORE, else the picked ones topped up to three. */
export function shownTags(selected: readonly TasteTag[], more: boolean): TasteTag[] {
  const all = quizTags();
  if (more) return all;
  return [...selected, ...all.filter((tag) => !selected.includes(tag))].slice(
    0,
    Math.max(SHOWN_CHIPS, selected.length),
  );
}
