/** The words on a swipe card that are built from facts: who else said yes, and the facts line. */
import { t } from '@lingui/core/macro';

import { categoryLabel } from './category';
import type { DeckReason } from '@cp/domain';

/** "Alex + Rin said yes"; more than two are counted. */
export function socialPill(names: readonly string[]): string | null {
  const [first, second] = names;
  if (first === undefined) return null;
  if (second === undefined)
    return t({ id: 'explore.swipe.saidYesOne', message: `${first} said yes` });
  const more = names.length - 2;
  return more > 0
    ? t({ id: 'explore.swipe.saidYesMore', message: `${first} + ${second} + ${more} said yes` })
    : t({ id: 'explore.swipe.saidYesTwo', message: `${first} + ${second} said yes` });
}

/** "Temple · 6 min from the stay · free". */
export function swipeMeta(
  category: string,
  priceLevel: number | null,
  reasons: readonly DeckReason[],
): string {
  const parts = [categoryLabel(category)];
  const near = reasons.find((reason) => reason.code === 'near_stay');
  if (near !== undefined && typeof near.value === 'number') {
    const minutes = Math.max(1, Math.round(near.value / 80));
    parts.push(t({ id: 'explore.swipe.fromStay', message: `${minutes} min from the stay` }));
  }
  if (priceLevel === 0) parts.push(t({ id: 'explore.place.free', message: 'free' }));
  return parts.join(' · ');
}
