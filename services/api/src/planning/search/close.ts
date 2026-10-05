/**
 * "Close to that": when every part of a plain-words search together matches nothing, the weakest
 * parts are dropped until something does, and the answer says which. Most places have no hours
 * stored, so "open past 22:00" goes first, then the minutes limit, then the attributes ("quiet"):
 * one of them alone when that is enough, else together. Those three are read off the first pass
 * without searching again. Only then does a hard part go:
 * the words, the price, and last the kind of place when a meal still says what she is after.
 */
import type { SearchFilter } from '@cp/domain';

import type { Evaluated, SoftMiss } from './evaluate';

export type DroppedPart =
  'open_past' | 'max_minutes' | 'attribute' | 'text' | 'price_max' | 'category';

export interface CloseAnswer {
  readonly results: readonly Evaluated[];
  readonly dropped: readonly DroppedPart[];
}

const SOFT_ORDER: readonly SoftMiss[] = ['open_past', 'max_minutes', 'attribute'];

function has(filter: SearchFilter, part: DroppedPart): boolean {
  switch (part) {
    case 'open_past':
      return filter.open_past !== undefined;
    case 'max_minutes':
      return filter.max_minutes !== undefined;
    case 'attribute':
      return (filter.attributes?.length ?? 0) > 0;
    case 'text':
      return (filter.text?.trim() ?? '') !== '';
    case 'price_max':
      return filter.price_max !== undefined;
    case 'category':
      return (filter.categories?.length ?? 0) > 0;
  }
}

const FILTER_KEY: Readonly<Record<DroppedPart, keyof SearchFilter>> = {
  open_past: 'open_past',
  max_minutes: 'max_minutes',
  attribute: 'attributes',
  text: 'text',
  price_max: 'price_max',
  category: 'categories',
};

function without(filter: SearchFilter, part: DroppedPart): SearchFilter {
  const next: Record<string, unknown> = { ...filter };
  delete next[FILTER_KEY[part]];
  return next;
}

/**
 * The closest answer to an empty search, or null when even the loosest one finds nothing.
 * `evaluated` is the first pass (every candidate with what it missed); `rerun` runs a filter and
 * answers its results, as the route would.
 */
export async function closeTo(
  filter: SearchFilter,
  evaluated: readonly Evaluated[],
  rerun: (filter: SearchFilter) => Promise<readonly Evaluated[]>,
): Promise<CloseAnswer | null> {
  const matching = (parts: readonly DroppedPart[]) => {
    const allowed = new Set<string>(parts);
    return evaluated.filter((place) => place.misses.every((miss) => allowed.has(miss)));
  };
  const soft = SOFT_ORDER.filter((part) => has(filter, part));
  // One part on its own first, so the answer never names a part it did not need to drop.
  for (const part of soft) {
    const results = matching([part]);
    if (results.length > 0) return { results, dropped: [part] };
  }
  const dropped: DroppedPart[] = [];
  let loose = filter;
  for (const part of soft) {
    dropped.push(part);
    loose = without(loose, part);
    const results = matching(dropped);
    if (results.length > 0) return { results, dropped };
  }
  // A meal says what she is after on its own; without one the kind of place is all there is.
  const hard: DroppedPart[] =
    filter.meal === undefined ? ['text', 'price_max'] : ['text', 'price_max', 'category'];
  for (const part of hard) {
    if (!has(loose, part)) continue;
    const next = without(loose, part);
    // Never a search with nothing left to match on.
    if (!has(next, 'text') && !has(next, 'category') && next.meal === undefined) continue;
    dropped.push(part);
    loose = next;
    const results = await rerun(loose);
    if (results.length > 0) return { results, dropped };
  }
  return null;
}
