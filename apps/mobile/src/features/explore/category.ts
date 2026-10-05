/** A place category's doodle and its name in the reader's language. */
import { t } from '@lingui/core/macro';

import type { DoodleName } from '@/ui/icons/generated';

const ICONS: Readonly<Record<string, DoodleName>> = {
  temple_shrine: 'temple',
  food: 'food',
  market: 'food',
  nature: 'volcano',
  beach: 'wave',
  museum: 'star',
  nightlife: 'flame',
  shopping: 'ticket',
  transit: 'car',
  stay: 'bed',
  health: 'spark',
};

export function categoryIcon(category: string): DoodleName {
  return ICONS[category] ?? 'pin';
}

export function categoryLabel(category: string): string {
  switch (category) {
    case 'temple_shrine':
      return t({ id: 'explore.category.temple', message: 'Temple' });
    case 'food':
      return t({ id: 'explore.category.food', message: 'Food' });
    case 'market':
      return t({ id: 'explore.category.market', message: 'Market' });
    case 'nature':
      return t({ id: 'explore.category.nature', message: 'Nature' });
    case 'beach':
      return t({ id: 'explore.category.beach', message: 'Beach' });
    case 'museum':
      return t({ id: 'explore.category.museum', message: 'Museum' });
    case 'nightlife':
      return t({ id: 'explore.category.nightlife', message: 'Nightlife' });
    case 'shopping':
      return t({ id: 'explore.category.shopping', message: 'Shopping' });
    case 'transit':
      return t({ id: 'explore.category.transit', message: 'Transit' });
    case 'stay':
      return t({ id: 'explore.category.stay', message: 'Stay' });
    case 'health':
      return t({ id: 'explore.category.health', message: 'Health' });
    default:
      return t({ id: 'explore.category.other', message: 'Place' });
  }
}

/**
 * Kinds of place in the order picks lead with them where nothing else ranks them: sights first
 * (temples and shrines, nature, beaches, museums, markets), then places to eat, then nightlife.
 * The api's picks read uses the same order.
 */
/* eslint-disable lingui/no-unlocalized-strings -- category keys, never copy. */
export const PICK_KIND_ORDER: readonly string[] = [
  'temple_shrine',
  'nature',
  'beach',
  'museum',
  'market',
  'other',
  'shopping',
  'health',
  'food',
  'nightlife',
  'transit',
  'stay',
];
/* eslint-enable lingui/no-unlocalized-strings */

export function kindRank(category: string): number {
  const at = PICK_KIND_ORDER.indexOf(category);
  return at === -1 ? PICK_KIND_ORDER.length : at;
}
