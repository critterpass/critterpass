/**
 * The name a place is shown under. Our places carry an English-first name and, where our editors
 * gave one, the name in the destination's own language ("Valley of Love", "Thung lũng Tình Yêu").
 * A reader who reads the destination's language sees the local name; anyone else the first. She
 * reads it when the language of her app (the part of her locale before any hyphen) is one of the
 * destination's languages, as its set of the dex records them (`vi` for Vietnam): the set linked
 * to the destination, else the set whose country code leads the destination's slug. The planner's
 * stop titles, the api and the app all use this one rule.
 */

const primary = (tag: string) => (tag.split('-')[0] ?? tag).toLowerCase();

/** Whether a reader with this app locale reads the destination's own language. */
export function readsLocalNames(
  locale: string | null | undefined,
  destinationLanguages: readonly string[] | null | undefined,
): boolean {
  if (locale === undefined || locale === null || locale === '') return false;
  const hers = primary(locale);
  return (destinationLanguages ?? []).some((language) => primary(language) === hers);
}

export interface NamedPlace {
  readonly name: string;
  readonly nameLocal?: string | null | undefined;
}

/** The name shown, and the other one (for a second line or search), when the two differ. */
export function shownPlaceName(
  place: NamedPlace,
  readsLocal: boolean,
): { readonly shown: string; readonly other: string | null } {
  const local = place.nameLocal?.trim() ?? '';
  if (local === '' || local === place.name) return { shown: place.name, other: null };
  return readsLocal ? { shown: local, other: place.name } : { shown: place.name, other: local };
}

/** The name `place` is shown under to this reader. */
export function shownName(place: NamedPlace, readsLocal: boolean): string {
  return shownPlaceName(place, readsLocal).shown;
}
