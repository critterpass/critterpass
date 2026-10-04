/**
 * Which record each duplicate folds into: same-named long features merge into their group's
 * place, decided pairs follow their verdict, and the curator's rulings (data/pinned-places) settle
 * what the decision left open, by a street address or a Wikidata item, or keep both.
 */
import type { DuplicatePair, DuplicateVerdict } from './duplicates';

export type Duplicate = { readonly of: string; readonly verdict: DuplicateVerdict };

/** Two records of the curated set the curator ruled on: one place (the second merges) or two. */
export interface PairRuling {
  /** Content refs; when `same`, the second merges into the first. */
  readonly refs: readonly [string, string];
  /** The names, for the review page. */
  readonly names: readonly [string, string];
  readonly same: boolean;
  readonly why: string;
}

/** Same-named records merge into the group's must-see where it holds one, not its shortest name. */
export function intoKept(
  merges: readonly { from: string; into: string }[],
  kept: ReadonlySet<string>,
): { from: string; into: string }[] {
  const root = new Map<string, string>();
  for (const { from, into } of merges) {
    if (kept.has(from) && !kept.has(root.get(into) ?? into)) root.set(into, from);
  }
  return merges.flatMap(({ from, into }) => {
    const target = root.get(into);
    if (target === undefined) return [{ from, into }];
    return from === target ? [{ from: into, into: target }] : [{ from, into: target }];
  });
}

/**
 * Each place's duplicate: a same-named long feature merges into its group's place; otherwise the
 * last decided pair naming it wins. A merge that would close a loop (A into B into A, hiding both)
 * is left out. Rulings come last and replace what the decision said of their pair.
 */
export function duplicatesOf(
  merges: readonly { from: string; into: string }[],
  pairs: readonly DuplicatePair[],
  verdicts: ReadonlyMap<string, DuplicateVerdict>,
  rulings: readonly PairRuling[] = [],
): Map<string, Duplicate> {
  const found = new Map<string, Duplicate>();
  const loops = (from: string, of: string) => {
    for (let at: string | undefined = of; at !== undefined;) {
      if (at === from) return true;
      const next = found.get(at);
      at = next?.verdict === 'merge' ? next.of : undefined;
    }
    return false;
  };
  for (const merge of merges) found.set(merge.from, { of: merge.into, verdict: 'merge' });
  const grouped = new Set(found.keys());
  for (const pair of pairs) {
    const verdict = verdicts.get(`${pair.a.ref}|${pair.b.ref}`) ?? 'review';
    if (verdict === 'distinct' || grouped.has(pair.b.ref)) continue;
    if (verdict === 'merge' && loops(pair.b.ref, pair.a.ref)) continue;
    found.set(pair.b.ref, { of: pair.a.ref, verdict });
  }
  for (const { refs, same } of rulings) {
    const [first, second] = refs;
    if (found.get(first)?.of === second) found.delete(first);
    if (found.get(second)?.of === first) found.delete(second);
    if (same && !loops(second, first)) found.set(second, { of: first, verdict: 'merge' });
  }
  return found;
}
