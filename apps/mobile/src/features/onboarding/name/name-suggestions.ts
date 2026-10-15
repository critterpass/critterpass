/**
 * Shorter names to offer when a name reaches the pass's limit: the name the person is called by
 * (the first word of a Western name, the last of a family-name-first one such as Vietnamese), then
 * that name with the family name's initial. Only ones that are shorter than the name, fit the pass
 * and differ.
 */
import { GIVEN_NAME_MAX, givenNameLength } from '@cp/domain';

import { familyNameFirst, nameWords } from '@cp/domain';

export function nameSuggestions(name: string): string[] {
  const words = nameWords(name);
  if (words.length < 2) return [];
  const familyFirst = familyNameFirst(words);
  const given = (familyFirst ? words[words.length - 1] : words[0]) ?? '';
  const family = (familyFirst ? words[0] : words[words.length - 1]) ?? '';
  const initial = [...family][0] ?? '';
  const options = [given, `${given} ${initial}.`];
  const length = givenNameLength(name);
  return [...new Set(options)].filter(
    (option) => givenNameLength(option) < length && givenNameLength(option) <= GIVEN_NAME_MAX,
  );
}

/** At the limit: the next letter would be refused. */
export function atNameLimit(name: string): boolean {
  return givenNameLength(name) >= GIVEN_NAME_MAX;
}
