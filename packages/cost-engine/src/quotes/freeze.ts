/**
 * Freeze semantics: once a vote or proposal opens on a set, its numbers never drift. A frozen set
 * refuses edits; a fresh price becomes a new set with a new version that a new poll may use.
 */
import { DomainError } from '@cp/domain';

import { createQuoteSet, type CostComponent, type QuoteSet } from './quote-set';

export function isFrozen(set: QuoteSet): boolean {
  return set.frozenAt !== undefined;
}

/** Pins every component at `at`; freezing an already-frozen set keeps its original instant. */
export function freezeQuoteSet(set: QuoteSet, at: Date): QuoteSet {
  if (set.frozenAt !== undefined) return set;
  const frozenAt = at.toISOString();
  return {
    version: set.version,
    frozenAt,
    components: set.components.map((component) => ({ ...component, frozenAt })),
  };
}

/** Replaces the components of an unfrozen set (new version); a frozen set throws. */
export function replaceComponents(set: QuoteSet, components: readonly CostComponent[]): QuoteSet {
  if (isFrozen(set)) {
    throw new DomainError('STATE_INVALID', { reason: 'quote_set_frozen', version: set.version });
  }
  return createQuoteSet(components);
}

/** Throws unless every set is frozen: tie-breaks and proposals only ever read pinned numbers. */
export function assertFrozen(sets: readonly QuoteSet[]): void {
  const open = sets.filter((set) => !isFrozen(set));
  if (open.length > 0) {
    throw new DomainError('STATE_INVALID', {
      reason: 'quote_set_not_frozen',
      versions: open.map((set) => set.version),
    });
  }
}
