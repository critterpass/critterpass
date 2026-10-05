/**
 * The name a place is shown under. Our places carry an English-first name and, where our editors
 * gave one, the name in the destination's own language ("Valley of Love", "Thung lũng Tình Yêu").
 * An organiser who reads the destination's language sees the local name; anyone else the first.
 * She reads it when the language of her app (the part of her locale before any hyphen) is one of
 * the destination's languages, as its set of the dex records them (`vi` for Vietnam).
 */
import type { DraftPoi } from '@cp/planner';

import type { DraftPlanInput } from './context';

type Reader = Pick<DraftPlanInput, 'locale' | 'destinationLanguages'>;

const primary = (tag: string) => (tag.split('-')[0] ?? tag).toLowerCase();

/** Whether the organiser reads the destination's own language. */
export function readsLocalNames(input: Reader): boolean {
  if (input.locale === undefined) return false;
  const hers = primary(input.locale);
  return (input.destinationLanguages ?? []).some((language) => primary(language) === hers);
}

/** The name `poi` is shown under to this draft's reader. */
export function shownName(input: Reader, poi: Pick<DraftPoi, 'name' | 'nameLocal'>): string {
  const local = poi.nameLocal?.trim() ?? '';
  return readsLocalNames(input) && local.length > 0 ? local : poi.name;
}
