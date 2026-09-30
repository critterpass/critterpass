/**
 * Sponsored slot rules (docs/product-decisions.md §7 sponsored picks): at most one labelled slot per
 * Explore list, at a fixed position (the third card), never first and never replacing an organic
 * pick, and only where `sponsored(u,t)` holds. Organic order stays exactly as ranked.
 */
export const SPONSORED_SLOT_INDEX = 2;

export type ListEntry<T, S> =
  | { readonly kind: 'organic'; readonly item: T }
  | { readonly kind: 'sponsored'; readonly item: S; readonly label: 'SPONSORED' };

/**
 * Inserts `sponsored` into `organic` at the fixed slot when `eligible`. A list too short to have a
 * third card shows the slot after its last card, and an empty list never shows one.
 */
export function withSponsoredSlot<T, S>(
  organic: readonly T[],
  sponsored: S | null,
  eligible: boolean,
): ListEntry<T, S>[] {
  const entries: ListEntry<T, S>[] = organic.map((item) => ({ kind: 'organic', item }));
  if (!eligible || sponsored === null || organic.length === 0) return entries;
  const at = Math.min(SPONSORED_SLOT_INDEX, organic.length);
  entries.splice(at, 0, { kind: 'sponsored', item: sponsored, label: 'SPONSORED' });
  return entries;
}
