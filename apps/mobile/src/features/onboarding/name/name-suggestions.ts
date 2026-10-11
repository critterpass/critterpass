/**
 * Shorter names to offer when a name reaches the pass's limit: the first word, then the first word
 * with the last word's initial. Only ones that are shorter than the name, fit the pass and differ.
 */
import { GIVEN_NAME_MAX, givenNameLength } from '@cp/domain';

export function nameSuggestions(name: string): string[] {
  const words = name
    .trim()
    .split(/\s+/u)
    .filter((word) => word.length > 0);
  if (words.length < 2) return [];
  const first = words[0] ?? '';
  const last = words[words.length - 1] ?? '';
  const initial = [...last][0] ?? '';
  const options = [first, `${first} ${initial}.`];
  const length = givenNameLength(name);
  return [...new Set(options)].filter(
    (option) => givenNameLength(option) < length && givenNameLength(option) <= GIVEN_NAME_MAX,
  );
}

/** At the limit: the next letter would be refused. */
export function atNameLimit(name: string): boolean {
  return givenNameLength(name) >= GIVEN_NAME_MAX;
}
